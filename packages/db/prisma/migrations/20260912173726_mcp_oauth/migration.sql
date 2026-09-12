-- CreateTable
CREATE TABLE "mcp_oauth_client" (
    "id" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "clientName" TEXT NOT NULL,
    "redirectUris" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_auth_code" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_auth_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_access_token" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_auth_code_codeHash_key" ON "mcp_auth_code"("codeHash");

-- CreateIndex
CREATE INDEX "mcp_auth_code_clientId_idx" ON "mcp_auth_code"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_token_tokenHash_key" ON "mcp_access_token"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_token_refreshTokenHash_key" ON "mcp_access_token"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "mcp_access_token_organizationId_idx" ON "mcp_access_token"("organizationId");

-- CreateIndex
CREATE INDEX "mcp_access_token_clientId_idx" ON "mcp_access_token"("clientId");
