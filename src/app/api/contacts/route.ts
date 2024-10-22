import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../../../lib/auth";
import {
  contactSchema,
  contactFilterSchema,
  dateRangeSchema,
} from "../../../lib/validation";

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

  const url = new URL(request.url);
  const filterParams = Object.fromEntries(url.searchParams);

  try {
    const { name, email, timezone, sortBy, sortOrder, page, pageSize } =
      await contactFilterSchema.validateAsync(filterParams);

    const where = {
      userId,
      ...(name && { name: { contains: name } }),
      ...(email && { email: { contains: email } }),
      ...(timezone && { timezone }),
      deletedAt: null,
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Error retrieving contacts" },
      { status: 400 }
    );
  }
}

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
    const body = await request.json();
    const validatedContact = await contactSchema.validateAsync(body);

    const existingContact = await prisma.contact.findFirst({
      where: { email: validatedContact.email, userId, deletedAt: null },
    });

    if (existingContact) {
      return NextResponse.json(
        { message: "Contact with this email already exists" },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: { ...validatedContact, userId },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: "Error creating contact" },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, ...updateData } = await request.json();
    const validatedContact = await contactSchema.validateAsync(updateData);

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existingContact) {
      return NextResponse.json(
        { message: "Contact not found" },
        { status: 404 }
      );
    }

    const updatedContact = await prisma.contact.update({
      where: { id },
      data: validatedContact,
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    return NextResponse.json(
      { message: "Error updating contact" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existingContact) {
      return NextResponse.json(
        { message: "Contact not found" },
        { status: 404 }
      );
    }

    await prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ message: "Contact deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { message: "Error deleting contact" },
      { status: 400 }
    );
  }
}
