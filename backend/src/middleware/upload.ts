import multer from "multer";
import { env } from "../config/env";

/**
 * Memory storage: files never touch disk. Fine at the sizes credit
 * reports come in (a few hundred KB); swap to disk storage first if
 * you raise MAX_UPLOAD_BYTES a lot.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ok = ["application/pdf", "text/csv", "application/vnd.ms-excel"].includes(file.mimetype) || /\.(pdf|csv)$/i.test(file.originalname);
    if (!ok) return cb(new Error("Only PDF and CSV files are accepted"));
    cb(null, true);
  },
});
