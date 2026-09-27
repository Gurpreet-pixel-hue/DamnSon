from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.post("/v1/copilot", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def copilot() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not Implemented")
