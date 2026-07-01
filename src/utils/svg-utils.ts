/**
 * Dimensions extractor for SVGs to ensure crisp Canvas Rendering at exact scale.
 * Falls back to 300x150 standard if no dimensions can be parsed.
 */
export async function getSvgDimensions(
  file: File,
): Promise<{ width: number; height: number; text: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svgEl = doc.querySelector("svg");

      if (!svgEl) {
        resolve({ width: 300, height: 150, text });
        return;
      }

      let width = parseFloat(svgEl.getAttribute("width") || "");
      let height = parseFloat(svgEl.getAttribute("height") || "");

      // Viewbox analysis if explicit width/height is missing
      if (isNaN(width) || isNaN(height)) {
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/).map(Number);
          if (parts.length === 4) {
            width = width || parts[2];
            height = height || parts[3];
          }
        }
      }

      resolve({
        width: width || 300,
        height: height || 300,
        text,
      });
    };
    reader.readAsText(file);
  });
}

/**
 * Principal conversion core supporting JPG/PNG canvas drawing.
 * Handles background filling for JPG output.
 */
export async function convertSvgToImage(
  svgText: string,
  width: number,
  height: number,
  scale: number,
  format: "png" | "jpg",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context 생성 실패"));
      return;
    }

    // Anti-aliasing configurations
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // If format is JPG, fill canvas with solid white background to prevent black transparent areas
    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    const img = new Image();
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        URL.revokeObjectURL(url);

        const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
        const quality = format === "jpg" ? 0.92 : undefined; // High quality JPEG compression

        canvas.toBlob(
          (imgBlob) => {
            if (imgBlob) {
              resolve(imgBlob);
            } else {
              reject(new Error(`Canvas ${format.toUpperCase()} Blob 변환 실패`));
            }
          },
          mimeType,
          quality,
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error("SVG 이미지 로드 실패 (정의되지 않은 태그나 유효하지 않은 XML 구문 가능성)"),
      );
    };

    img.src = url;
  });
}
