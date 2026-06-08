from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    # Supabase (填於 .env，勿提交)
    supabase_url: str = ""
    supabase_key: str = ""

    # GCP / Vertex AI
    gcp_project_id: str = ""
    gcp_location: str = "asia-east1"


settings = Settings()
