import uvicorn

from .server import CONFIG, app

if __name__ == "__main__":
    uvicorn.run(app, host=CONFIG["server"]["host"], port=CONFIG["server"]["port"], log_level="warning")
