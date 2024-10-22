import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../../../../lib/auth";
import { contactSchema } from "../../../../lib/validation";

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
    const { contacts } = await request.json();

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
      message: "Batch processing completed",
      createdContacts: result,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Error processing batch contacts" },
      { status: 400 }
    );
  }
}
