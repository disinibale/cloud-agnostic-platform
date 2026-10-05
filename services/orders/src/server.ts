import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createUsersClient } from "./usersClient.js";

const config = loadConfig();
const app = createApp({
  usersClient: createUsersClient(config.usersUrl, config.usersTimeoutMs),
});

app.listen(config.port, (error) => {
  if (error) {
    console.error(`orders service failed to start: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.info(
    `orders service listening on :${String(config.port)}, users service at ${config.usersUrl}`,
  );
});
