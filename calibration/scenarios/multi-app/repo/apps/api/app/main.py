from fastapi import FastAPI

from app.routes import projects

app = FastAPI(title="atlas-api")
app.include_router(projects.router)
