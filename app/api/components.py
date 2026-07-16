from fastapi import APIRouter, Depends
from app.core.registry import ComponentRegistry
from app.dependencies import get_registry

router = APIRouter(prefix="/api/components", tags=["components"])


@router.get("/loaders")
def list_loaders(registry: ComponentRegistry = Depends(get_registry)):
    return registry.list_loaders()


@router.get("/splitters")
def list_splitters(registry: ComponentRegistry = Depends(get_registry)):
    return registry.list_splitters()


@router.get("/embedders")
def list_embedders(registry: ComponentRegistry = Depends(get_registry)):
    return registry.list_embedders()
