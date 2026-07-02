function finalizeCell(value) {
  return value.trim();
}

function isBlankRow(row) {
  return row.every((cell) => cell.trim() === "");
}

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === "\"") {
        if (source[index + 1] === "\"") {
          currentCell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += character;
      }

      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      currentRow.push(finalizeCell(currentCell));
      currentCell = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    if (character === "\n") {
      currentRow.push(finalizeCell(currentCell));
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(finalizeCell(currentCell));
    rows.push(currentRow);
  }

  const filteredRows = rows.filter((row) => !isBlankRow(row));

  if (filteredRows.length === 0) {
    return [];
  }

  const [headerRow, ...valueRows] = filteredRows;
  const headers = headerRow.map((header) => header.trim());

  return valueRows.map((row) => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });

    return record;
  });
}
