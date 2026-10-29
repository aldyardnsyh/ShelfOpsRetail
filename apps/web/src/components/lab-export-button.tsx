"use client";

import { Download } from "@/components/icons";
import { Button } from "@/components/ui/button";

// Ekspor CSV di klien: data yang tampil di layar diunduh apa adanya,
// tanpa endpoint tambahan. BOM ditambahkan agar Excel mengenali UTF-8.
export function ExportCsvButton({
  filename,
  rows,
  label,
}: {
  filename: string;
  rows: (string | number)[][];
  label: string;
}) {
  function handleExport() {
    const body = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const blob = new Blob([`\uFEFF${body}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
      <Download />
      {label}
    </Button>
  );
}
