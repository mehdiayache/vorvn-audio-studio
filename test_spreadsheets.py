"""Batch spreadsheet adapter tests; no provider or database access."""

from io import BytesIO
import unittest

import openpyxl

from audio_studio.domain.batch import MAX_ROWS
from audio_studio.infrastructure.spreadsheets import read


class SpreadsheetAdapterTests(unittest.TestCase):
    def test_csv_sniffs_comma_and_semicolon_exports(self):
        comma = read("rows.csv", b"name,text\na,Hello\n")
        semicolon = read("rows.csv", b"name;text\na;Bonjour\n")
        self.assertEqual(comma["rows"], [["a", "Hello"]])
        self.assertEqual(semicolon["rows"], [["a", "Bonjour"]])

    def test_tsv_uses_the_explicit_tab_delimiter(self):
        result = read("rows.tsv", b"name\ttext\na\tHello\n")
        self.assertEqual(result["headers"], ["name", "text"])

    def test_latin_one_exports_remain_readable(self):
        result = read("rows.csv", "name,text\na,Crème".encode("latin-1"))
        self.assertEqual(result["rows"][0][1], "Crème")

    def test_xlsx_reads_display_values_and_blank_cells(self):
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.append(["name", None, "text"])
        sheet.append(["one", None, "مرحبا"])
        payload = BytesIO()
        workbook.save(payload)

        result = read("rows.xlsx", payload.getvalue())

        self.assertEqual(result["headers"], ["name", "Column 2", "text"])
        self.assertEqual(result["rows"], [["one", "", "مرحبا"]])

    def test_limit_is_explicit_and_reports_truncation(self):
        payload = "text\n" + "\n".join(f"row-{index}" for index in range(MAX_ROWS + 1))
        result = read("rows.csv", payload.encode())
        self.assertEqual(len(result["rows"]), MAX_ROWS)
        self.assertTrue(result["truncated"])

    def test_empty_and_unsupported_files_fail_clearly(self):
        with self.assertRaisesRegex(ValueError, "no rows"):
            read("rows.csv", b"")
        with self.assertRaisesRegex(ValueError, "Use .csv"):
            read("rows.pdf", b"not a spreadsheet")


if __name__ == "__main__":
    unittest.main()
