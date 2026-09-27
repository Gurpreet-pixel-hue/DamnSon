from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.post("/v1/search", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def search() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not Implemented")
