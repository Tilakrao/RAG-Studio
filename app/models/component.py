from pydantic import BaseModel


class ComponentParam(BaseModel):
    name: str
    type: str
    default: object = None
    options: list[str] | None = None
    description: str = ""


class ComponentInfo(BaseModel):
    name: str
    params_schema: list[dict] = []


class EmbedderInfo(BaseModel):
    name: str
    model_name: str
    dimension: int
