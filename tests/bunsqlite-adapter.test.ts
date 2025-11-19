import { RunTestSuite } from "./common/test-suite";

import { PrismaClient } from "@/prisma-generated/client";
import { PrismaBunSQLite } from "../src/bunsqlite-adapter";

const url = process.env.DATABASE_URL_FROM_ROOT!;
const adapter = new PrismaBunSQLite({ url });
const prisma = new PrismaClient({ adapter });

RunTestSuite(prisma, { adapterName: "bunsqlite" });
