import { RunTestSuite } from "./common/test-suite";

import { PrismaClient } from "@/prisma-generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const url = process.env.DATABASE_URL_FROM_ROOT!;
const adapter = new PrismaLibSQL({ url });
const prisma = new PrismaClient({ adapter });

RunTestSuite(prisma, { adapterName: "libsql" });
