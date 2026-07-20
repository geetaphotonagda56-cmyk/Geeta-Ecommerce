import { useState, useCallback } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
import { getCroppedImageFile } from "../utils/canvasCrop";

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
  const [aspectIndex, setAspectIndex] = useState(defaultAspectIndex);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  // Fill ON (default): whole image visible, scaled so its longer side hits
  // the frame edge at 100% ("contain") - remaining gap is painted with
  // backgroundColor. Fill OFF: image is cropped to fill the frame edge-to-edge
  // ("cover"), no background color needed since there's no gap.
  const [fillFrame, setFillFrame] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");

  const imageSrc = file ? URL.createObjectURL(file) : "";

  const onCropCompleteInternal = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  if (!open || !file) return null;

  const activeAspect = aspectRatios[aspectIndex]?.value ?? undefined;

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const croppedFile = await getCroppedImageFile(
        imageSrc,
        croppedAreaPixels,
        file.name,
        file.type || "image/jpeg",
        backgroundColor
      );
      onCropped(croppedFile);
    } catch (e) {
      console.error("Failed to crop image", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h3 className="text-base font-bold text-neutral-800">Edit Image</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div
          className="relative h-80 w-full sm:h-96"
          style={{ backgroundColor: fillFrame ? backgroundColor : "#171717" }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            minZoom={0.2}
            maxZoom={3}
            aspect={activeAspect}
            objectFit={fillFrame ? "contain" : "cover"}
            restrictPosition={!fillFrame}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteInternal}
          />
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-600">Fill:</span>
            <button
              type="button"
              onClick={() => setFillFrame((prev) => !prev)}
              className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                fillFrame
                  ? "border-[var(--primary-color)] bg-[var(--primary-color)] text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {fillFrame ? "Fill On" : "Fill Off"}
            </button>
            <span className="text-[11px] text-neutral-400">
              {fillFrame ? "Whole image visible, gaps filled with background color" : "Image is cropped to fill the frame edge-to-edge"}
            </span>
          </div>

          {fillFrame && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-600">Background Color:</span>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0.5"
                aria-label="Background color"
              />
              <span className="text-[11px] text-neutral-400 uppercase">{backgroundColor}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-600">Aspect Ratio:</span>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map((ratio, index) => (
                <button
                  key={ratio.label}
                  type="button"
                  onClick={() => setAspectIndex(index)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                    aspectIndex === index
                      ? "border-[var(--primary-color)] bg-[var(--primary-color)] text-white"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-neutral-600 w-12">Zoom</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </div>
          {fillFrame && (
            <p className="text-[11px] text-neutral-400 -mt-2">
              Drag the zoom slider below 1x to shrink the image and reveal more background.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !croppedAreaPixels}
              className="rounded-md bg-[var(--primary-color)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
