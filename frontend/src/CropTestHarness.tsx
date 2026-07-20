import { useState } from "react";
import ImageCropperModal from "./components/ImageCropperModal";

export default function CropTestHarness() {
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  return (
    <div style={{ padding: 40 }}>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          setOpen(!!f);
        }}
      />
      {resultUrl && (
        <div style={{ marginTop: 20 }}>
          <p>Result:</p>
          <img src={resultUrl} style={{ border: "1px solid red", maxWidth: 400 }} />
        </div>
      )}
      <ImageCropperModal
        file={file}
        open={open}
        onClose={() => setOpen(false)}
        onCropped={(f) => {
          setResultUrl(URL.createObjectURL(f));
          setOpen(false);
        }}
      />
    </div>
  );
}
