-- Personal answer links (phase 3): a candidate answers a question set at
-- /answer/<token> without an account.
ALTER TABLE "responses" ADD COLUMN "token" TEXT;
ALTER TABLE "responses" ADD COLUMN "invitedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "responses_token_key" ON "responses"("token");
