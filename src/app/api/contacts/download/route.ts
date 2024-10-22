import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../../../../lib/auth";
import { stringify } from "csv-stringify/sync";
import * as XLSX from "xlsx";

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
    const contacts = await prisma.contact.findMany({
      where: { userId, deletedAt: null },
      select: {
        name: true,
        email: true,
        phone: true,
        address: true,
        timezone: true,
        createdAt: true,
      },
    });

    const format = request.nextUrl.searchParams.get("format") || "csv";

    if (format === "csv") {
      const csv = stringify(contacts, { header: true });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=contacts.csv",
        },
      });
    } else if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(contacts);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=contacts.xlsx",
        },
      });
    } else {
      return NextResponse.json(
        { message: "Unsupported format" },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: "Error downloading contacts" },
      { status: 500 }
    );
  }
}
