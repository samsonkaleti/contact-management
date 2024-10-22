import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../../../lib/auth";
import {
  userSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from "../../../lib/validation";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  const { pathname } = new URL(request.url);

  if (pathname.endsWith("/register")) {
    return handleRegister(request);
  } else if (pathname.endsWith("/login")) {
    return handleLogin(request);
  } else if (pathname.endsWith("/verify")) {
    return handleVerify(request);
  } else if (pathname.endsWith("/reset-password-request")) {
    return handleResetPasswordRequest(request);
  } else if (pathname.endsWith("/reset-password")) {
    return handleResetPassword(request);
  }

  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

async function handleRegister(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = await userSchema.validateAsync(body);

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
      data: { email, password: hashedPassword, name, verificationToken },
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
  } catch (error:any) {
    console.error("Error in handleRegister:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { message: "A user with this email already exists" },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { message: "Error creating user", error: error.message },
      { status: 500 }
    );
  }
}

async function handleLogin(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = await loginSchema.validateAsync(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerified) {
      return NextResponse.json(
        { message: "Invalid credentials or unverified account" },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 400 }
      );
    }

    const token = generateToken(user.id);
    return NextResponse.json({ token });
  } catch (error) {
    return NextResponse.json({ message: "Error logging in" }, { status: 500 });
  }
}

async function handleVerify(request: NextRequest) {
  try {
    const { token } = await request.json();
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Invalid verification token" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    return NextResponse.json({ message: "Email verified successfully" });
  } catch (error) {
    return NextResponse.json(
      { message: "Error verifying email" },
      { status: 500 }
    );
  }
}

async function handleResetPasswordRequest(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = await passwordResetRequestSchema.validateAsync(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({
        message: "If the email exists, a reset code has been sent.",
      });
    }

    const resetToken = Math.random().toString(36).slice(-8);
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpires },
    });

    await sendPasswordResetEmail(email, resetToken);

    return NextResponse.json({
      message: "If the email exists, a reset code has been sent.",
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Error processing password reset request" },
      { status: 500 }
    );
  }
}

async function handleResetPassword(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, newPassword } =
      await passwordResetSchema.validateAsync(body);

    const user = await prisma.user.findFirst({
      where: {
        email,
        resetToken: code,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Invalid or expired reset code" },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    return NextResponse.json(
      { message: "Error resetting password" },
      { status: 500 }
    );
  }
}
