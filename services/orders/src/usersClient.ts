export interface UsersClient {
  userExists(userId: string): Promise<boolean>;
}

/** The users service could not give an answer: unreachable, timed out or failing. */
export class UsersServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UsersServiceError";
  }
}

export function createUsersClient(
  baseUrl: string,
  timeoutMs: number,
): UsersClient {
  return {
    async userExists(userId) {
      const url = `${baseUrl}/users/${encodeURIComponent(userId)}`;

      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        const reason =
          err instanceof Error && err.name === "TimeoutError"
            ? `timed out after ${String(timeoutMs)}ms`
            : String(err);
        throw new UsersServiceError(`users service request failed: ${reason}`, {
          cause: err,
        });
      }

      // Only the status matters. Cancelling the body releases the connection
      // instead of leaving it to the garbage collector.
      await res.body?.cancel();

      if (res.status === 200) {
        return true;
      }
      if (res.status === 404) {
        return false;
      }
      throw new UsersServiceError(
        `users service returned status ${String(res.status)}`,
      );
    },
  };
}
