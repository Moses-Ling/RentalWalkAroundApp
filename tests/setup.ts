import os from "os";
import path from "path";
import fs from "fs";

process.env.DATABASE_URL = "postgresql://rental:rental@localhost:5433/rental_test";
process.env.APP_PASSWORD = "test-password";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rental-uploads-"));
