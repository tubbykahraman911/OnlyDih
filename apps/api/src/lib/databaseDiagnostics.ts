type PrismaLikeError = {
  code?: unknown;
  message?: unknown;
};

export function sanitizedDatabaseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return {
      databaseUrlPresent: false
    };
  }

  try {
    const url = new URL(raw);
    return {
      databaseUrlPresent: true,
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port || defaultPortForProtocol(url.protocol),
      databaseName: url.pathname.replace(/^\//, "") || null,
      username: url.username ? decodeURIComponent(url.username) : null
    };
  } catch {
    return {
      databaseUrlPresent: true,
      parseError: "DATABASE_URL is not a valid URL"
    };
  }
}

export function sanitizedPrismaError(error: unknown) {
  const prismaError = error as PrismaLikeError;
  return {
    code: typeof prismaError.code === "string" ? prismaError.code : null,
    message: redactSensitiveDatabaseText(typeof prismaError.message === "string" ? prismaError.message : String(error))
  };
}

export function logDatabaseStartupDiagnostic() {
  console.log("[db] startup diagnostic", sanitizedDatabaseTarget());
}

export function logDatabaseFailureDiagnostic(error: unknown) {
  console.error("[db] health check failed", {
    target: sanitizedDatabaseTarget(),
    error: sanitizedPrismaError(error)
  });
}

function defaultPortForProtocol(protocol: string) {
  if (protocol === "postgres:" || protocol === "postgresql:") return "5432";
  return null;
}

function redactSensitiveDatabaseText(message: string) {
  let redacted = message;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    redacted = redacted.split(databaseUrl).join("[REDACTED_DATABASE_URL]");
  }

  redacted = redacted.replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1[REDACTED_PASSWORD]@");
  redacted = redacted.replace(/(password=)[^&\s]+/gi, "$1[REDACTED_PASSWORD]");
  redacted = redacted.replace(/(P(?:ASSWORD|ASS)=)[^;\s]+/g, "$1[REDACTED_PASSWORD]");
  return redacted;
}
