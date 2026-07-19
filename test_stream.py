import asyncio
from httpx import AsyncClient

async def run():
    async with AsyncClient() as client:
        async with client.stream("GET", "http://localhost:8000/api/scenario/SCN_GAS_LEAK_CONF_SPACE/stream") as response:
            async for line in response.aiter_lines():
                if line:
                    print(line)

asyncio.run(run())
