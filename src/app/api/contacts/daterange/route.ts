import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../../../../lib/auth";
import { dateRangeSchema } from "../../../../lib/validation";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const { startDate, endDate } = await dateRangeSchema.validateAsync({
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    });

    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        deletedAt: null,
      },
    });

    return NextResponse.json(contacts);
  } catch (error) {
    return NextResponse.json(
      { message: "Error retrieving contacts by date range" },
      { status: 400 }
    );
  }
}
