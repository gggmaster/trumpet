# Investment File Assistant

A local retrieval chatbot for:

`C:\Users\ll_ga\OneDrive\00\investment`

## Start

Run:

```powershell
.\start_chatbot.ps1
```

Then open `http://127.0.0.1:8765`.

## AI answers

Local search and source passages work without an API key. To enable synthesized
answers, set an OpenAI API key before starting:

```powershell
$env:OPENAI_API_KEY="your-key"
.\start_chatbot.ps1
```

The app sends only the retrieved excerpts for the current question, not the
entire source folder. The default model is `gpt-5.5`; override it with:

```powershell
$env:OPENAI_MODEL="gpt-5.5"
```

## Rebuild the index

Use the refresh button in the app, or run:

```powershell
& "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\indexer.py --skip-pdf
```

The initial configuration skips PDFs for speed. To include PDFs later, run the
same command without `--skip-pdf`, or start the server with
`INVESTMENT_SKIP_PDF=0`.

## Coverage

Indexed: PDF, DOCX, XLSX, XLSM, CSV, TXT, HTML.

Not indexed automatically: photos, scans without embedded text, legacy DOC/XLS,
ZIP files, videos, CAD files, browser download placeholders, and obvious
identity documents. The index report records skipped and failed files.
