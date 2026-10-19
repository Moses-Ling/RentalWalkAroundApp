import { execSync } from "child_process";

const TEST_URL = "postgresql://rental:rental@localhost:5433/rental_test";

export default function setup() {
  try {
    execSync(
      `docker exec rentalwalk-db psql -U rental -d postgres -c "CREATE DATABASE rental_test"`,
      { stdio: "ignore" },
    );
  } catch {
    // already exists
  }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
}
