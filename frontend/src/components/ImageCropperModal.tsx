import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
// Required by react-easy-crop: without it, Tailwind's preflight `img { max-width: 100% }`
// fights the library's own transform-based image sizing, and its container never gets
// `position: absolute; inset: 0`, so the media never actually fits the crop box - the
// image renders too large/off and needs a manual zoom-out to compensate.
import "react-easy-crop/react-easy-crop.css";
import { Check, Loader2, Maximize2, RotateCcw, RotateCw, X, ZoomIn } from "lucide-react";
import { getCroppedImageFile } from "../utils/canvasCrop";

interface SmoothSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Custom drag slider (pointer events, no discrete steps) used instead of a
 * native <input type="range"> - continuous dragging feels smoother, and
 * setPointerCapture keeps tracking the drag even once the cursor leaves the
 * track, which the native control doesn't do as reliably.
 */
function SmoothSlider({ min, max, value, onChange }: SmoothSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const updateFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    onChange(min + ratio * (max - min));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      className="relative h-5 w-full cursor-pointer touch-none select-none"
    >
      <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-neutral-200" />
      <div
        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--primary-color)]"
        style={{ width: `${percent}%`, transition: dragging ? "none" : "width 120ms ease-out" }}
      />
      <div
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10 ${
          dragging ? "scale-110" : ""
        }`}
        style={{
          left: `calc(${percent}% - 8px)`,
          transition: dragging ? "transform 120ms ease-out" : "left 120ms ease-out, transform 120ms ease-out",
        }}
      />
    </div>
  );
}

export interface AspectRatioOption {
  label: string;
  value: number | null; // null = freeform
}

const DEFAULT_RATIOS: AspectRatioOption[] = [
  { label: "1:1", value: 1 },
  { label: "2:3", value: 2 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "Free", value: null },
];

interface ImageCropperModalProps {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onCropped: (croppedFile: File) => void;
  aspectRatios?: AspectRatioOption[];
  defaultAspectIndex?: number;
}

export default function ImageCropperModal({
  file,
  open,
  onClose,
  onCropped,
  aspectRatios = DEFAULT_RATIOS,
  defaultAspectIndex = 0,
}: ImageCropperModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectIndex, setAspectIndex] = useState(defaultAspectIndex);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  // Fill ON (default): whole image visible, scaled so its longer side hits
  // the frame edge at 100% ("contain") - remaining gap is painted with
  // backgroundColor. Fill OFF: image is cropped to fill the frame edge-to-edge
  // ("cover"), no background color needed since there's no gap.
  const [fillFrame, setFillFrame] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");

  // The area available for the crop box - the box itself is then shaped to
  // the chosen aspect ratio and fit inside these bounds (see boxDimensions
  // below), so switching ratios visibly resizes the frame instead of just
  // repositioning a selection rectangle over an unchanged image.
  const outerFrameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = outerFrameRef.current;
    if (!el) return;
    const update = () => setFrameSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const imageSrc = file ? URL.createObjectURL(file) : "";

  const onCropCompleteInternal = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  if (!open || !file) return null;

  const activeAspect = aspectRatios[aspectIndex]?.value ?? undefined;

  // Fit the aspect-shaped crop box inside the available frame area: whichever
  // dimension is the constraint (width or height) matches the frame edge,
  // the other is derived from the ratio, and the box centers via flexbox.
  const boxDimensions = (() => {
    const { width: maxW, height: maxH } = frameSize;
    if (!maxW || !maxH) return null;
    if (!activeAspect) return { width: maxW, height: maxH };
    const widthFromHeight = maxH * activeAspect;
    if (widthFromHeight <= maxW) return { width: widthFromHeight, height: maxH };
    return { width: maxW, height: maxW / activeAspect };
  })();

  // Selecting a ratio should re-fit the image into the new box (whole image
  // scaled to its max width/height within the frame) rather than keeping
  // whatever pan/zoom was left over from the previous ratio - resetting zoom
  // to 1 and crop to center lets react-easy-crop's own contain/cover sizing
  // do that automatically.
  const handleAspectChange = (index: number) => {
    setAspectIndex(index);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const rotateBy = (degrees: number) => {
    setRotation((prev) => (prev + degrees + 360) % 360);
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const croppedFile = await getCroppedImageFile(
        imageSrc,
        croppedAreaPixels,
        file.name,
        file.type || "image/jpeg",
        backgroundColor,
        rotation
      );
      onCropped(croppedFile);
    } catch (e) {
      console.error("Failed to crop image", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-neutral-950/75 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Edit Image</h3>
            <p className="text-xs text-neutral-400">Crop, rotate and fit your image</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_260px]">
          {/* Preview */}
          <div className="px-5 pb-5 sm:pb-0">
            <div ref={outerFrameRef} className="flex h-72 w-full items-center justify-center sm:h-[26rem]">
              {boxDimensions && (
                <div
                  className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-neutral-200"
                  style={{
                    width: boxDimensions.width,
                    height: boxDimensions.height,
                    backgroundColor: fillFrame ? backgroundColor : "#171717",
                  }}
                >
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    minZoom={0.2}
                    maxZoom={3}
                    aspect={activeAspect}
                    objectFit={fillFrame ? "contain" : "cover"}
                    restrictPosition={!fillFrame}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onRotationChange={setRotation}
                    onCropComplete={onCropCompleteInternal}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-5 border-t border-neutral-100 px-5 py-5 sm:border-l sm:border-t-0">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <Maximize2 className="h-3.5 w-3.5" />
                Aspect Ratio
              </div>
              <div className="flex flex-wrap gap-1.5">
                {aspectRatios.map((ratio, index) => (
                  <button
                    key={ratio.label}
                    type="button"
                    onClick={() => handleAspectChange(index)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      aspectIndex === index
                        ? "bg-[var(--primary-color)] text-white shadow-sm"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <RotateCw className="h-3.5 w-3.5" />
                Rotate
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => rotateBy(-90)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                  aria-label="Rotate left 90 degrees"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(90)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                  aria-label="Rotate right 90 degrees"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                {rotation !== 0 && (
                  <span className="flex items-center text-xs font-semibold text-neutral-400">{rotation}°</span>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                <ZoomIn className="h-3.5 w-3.5" />
                Zoom
              </div>
              <SmoothSlider min={0.2} max={3} value={zoom} onChange={setZoom} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">Fill Frame</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillFrame}
                  onClick={() => setFillFrame((prev) => !prev)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    fillFrame ? "bg-[var(--primary-color)]" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      fillFrame ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className="text-[11px] leading-snug text-neutral-400">
                {fillFrame
                  ? "Whole image visible, gaps filled with a background color."
                  : "Image is cropped edge-to-edge to fill the frame."}
              </p>

              {fillFrame && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-inset ring-neutral-200">
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="absolute -left-1 -top-1 h-9 w-9 cursor-pointer border-0 p-0"
                      aria-label="Background color"
                    />
                  </label>
                  <span className="text-[11px] uppercase text-neutral-400">{backgroundColor}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary-color)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save &amp; Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
