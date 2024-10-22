import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../../../../lib/auth";
import { contactSchema } from "../../../../lib/validation";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { message: "No file uploaded" },
        { status: 400 }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    let contacts;

    if (file.name.endsWith(".csv")) {
      const csvContent = new TextDecoder().decode(fileBuffer);
      contacts = parse(csvContent, { columns: true, skip_empty_lines: true });
    } else if (file.name.endsWith(".xlsx")) {
      const workbook = XLSX.read(fileBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      contacts = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return NextResponse.json(
        { message: "Unsupported file format" },
        { status: 400 }
      );
    }

    const validatedContacts = await Promise.all(
      contacts.map((contact: any) => contactSchema.validateAsync(contact))
    );

    const result = await prisma.$transaction(async (prisma) => {
      const createdContacts = [];
      for (const contact of validatedContacts) {
        const existingContact = await prisma.contact.findFirst({
          where: { email: contact.email, userId, deletedAt: null },
        });

        if (existingContact) {
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: contact,
          });
        } else {
          const newContact = await prisma.contact.create({
            data: { ...contact, userId },
          });
          createdContacts.push(newContact);
        }
      }
      return createdContacts;
    });

    return NextResponse.json({
      message: "File processed successfully",
      createdContacts: result,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Error processing file" },
      { status: 400 }
    );
  }
}
