import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import {
  hashPassword,
  generateToken,
  sendVerificationEmail,
} from "../../../../lib/auth";
import { userSchema } from "../../../../lib/validation";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { value, error } = userSchema.validate(body);

    if (error) {
      return NextResponse.json(
        { message: "Validation error", details: error.details },
        { status: 400 }
      );
    }

    const { email, password, name } = value;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { message: "User already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const verificationToken = uuidv4();

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        verificationToken,
        emailVerified: false,
      },
    });

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      // Optionally, you might want to delete the user if email sending fails
      // await prisma.user.delete({ where: { id: user.id } });
      return NextResponse.json(
        { message: "User created but failed to send verification email" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message:
          "User registered. Please check your email to verify your account.",
      },
      { status: 201 }
    );
  } catch (error : any) {
    console.error("Error in user registration:", error);
    return NextResponse.json(
      { message: "Error creating user", error: error.message },
      { status: 500 }
    );
  }
}
