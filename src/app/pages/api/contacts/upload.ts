import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "@/lib/auth";
import { parse } from "csv-parse/sync";
import { contactSchema } from "@/lib/validation"; // Assuming you're using Joi

const prisma = new PrismaClient();

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { csv } = req.body;
    const records = parse(csv, { columns: true, skip_empty_lines: true });

    
    const validatedContacts = records.map((record: any) => {
      const { error, value } = contactSchema.validate(record);

      if (error) {
        throw new Error(`Validation error: ${error.details[0].message}`);
      }

      return value; // Use validated data
    });

    // Insert validated contacts into the database
    await prisma.contact.createMany({
      data: validatedContacts.map((contact: any) => ({ ...contact, userId })),
    });

    res.status(200).json({ message: "Contacts uploaded successfully" });
  } catch (error: any) {
    res
      .status(400)
      .json({ message: `Error uploading contacts: ${error.message}` });
  }
}
