import logging
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.core.config import Settings

logger = logging.getLogger(__name__)


class MongoDB:
    """Manage the application's async MongoDB client and database handle."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.client: AsyncMongoClient[dict[str, Any]] | None = None
        self.database: Any | None = None

    async def connect(self) -> bool:
        """Create the client and ping MongoDB without failing app startup."""

        if self.client is None:
            self.client = AsyncMongoClient(
                self._settings.mongodb_uri,
                serverSelectionTimeoutMS=(
                    self._settings.mongodb_server_selection_timeout_ms
                ),
            )

        try:
            await self.client.admin.command("ping")
        except PyMongoError as exc:
            logger.warning(
                "MongoDB ping failed for database '%s': %s",
                self._settings.mongodb_database,
                type(exc).__name__,
            )
            return False

        self.database = self.client[self._settings.mongodb_database]
        logger.info(
            "Connected to MongoDB database '%s'",
            self._settings.mongodb_database,
        )
        return True

    async def check_connection(self) -> bool:
        """Return the current MongoDB connectivity state after a ping."""

        return await self.connect()

    async def close(self) -> None:
        """Close the client and release its connection resources."""

        if self.client is not None:
            await self.client.close()
            self.client = None

        self.database = None
