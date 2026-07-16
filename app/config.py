from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    data_dir: Path = Field(default=Path("./data"))
    hf_home: Path = Field(default=Path("./data/models"))
    transformers_offline: str = Field(default="0")
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")
    max_upload_size_mb: int = Field(default=50)
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    auth_username: str = Field(default="tilak1234rao")
    auth_password: str = Field(default="Til@k1234rao")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def chroma_dir(self) -> Path:
        return self.data_dir / "chroma"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "rag_studio.db"

    def ensure_dirs(self):
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
