import shutil
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
SOURCE_DIR = APP_DIR / "powerbi_exports"
TARGET_DIR = APP_DIR / "property_data_app" / "data"

CSV_FILES = [
    "observations.csv",
    "investment_properties.csv",
    "geographies.csv",
    "indicators.csv",
    "fetch_runs.csv",
]


def main():
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    for filename in CSV_FILES:
        source = SOURCE_DIR / filename
        target = TARGET_DIR / filename
        if not source.exists():
            raise FileNotFoundError(source)
        shutil.copy2(source, target)
        print(target)


if __name__ == "__main__":
    main()
