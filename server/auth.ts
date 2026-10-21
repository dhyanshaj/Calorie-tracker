import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Account, Profile } from "../shared/profile";
import { AppError } from "./errors";
const scrypt = promisify(scryptCallback);
const hashToken = (s: string) => createHash("sha256").update(s).digest("hex");
const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
const loginSchema = signupSchema.pick({ email: true, password: true });
const cookieName = "platewise_session";
export class Accounts {
  constructor(private db: DatabaseSync) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,profile TEXT);CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);`,
    );
  }
  account(row: any): Account {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      profile: row.profile ? JSON.parse(row.profile) : null,
    };
  }
  get(id: string): Account | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(id);
    return row ? this.account(row) : undefined;
  }
  async signup(body: unknown): Promise<Account> {
    const { name, email, password } = signupSchema.parse(body);
    const salt = randomBytes(16).toString("hex");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const passwordHash = `${salt}:${derived.toString("hex")}`;
    const id = randomUUID();
    try {
      this.db
        .prepare(
          "INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)",
        )
        .run(id, name, email, passwordHash);
    } catch (error) {
      if (this.db.prepare("SELECT id FROM users WHERE email=?").get(email))
        throw new AppError(
          409,
          "ACCOUNT_EXISTS",
          "An account with this email already exists. Sign in instead.",
        );
      throw error;
    }
    return this.get(id)!;
  }
  async login(body: unknown): Promise<Account> {
    const { email, password } = loginSchema.parse(body);
    const row = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email) as any;
    const [salt, expected] = row?.password_hash?.split(":") ?? [
      "missing-account-salt",
      "0".repeat(128),
    ];
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const valid = timingSafeEqual(actual, Buffer.from(expected, "hex"));
    if (!row || !valid)
      throw new AppError(401, "BAD_LOGIN", "Email or password is incorrect.");
    return this.account(row);
  }
  createSession(userId: string, res: Response) {
    const token = randomBytes(32).toString("hex");
    const maxAge = 30 * 86400;
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at < ?")
      .run(Date.now());
    this.db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      )
      .run(hashToken(token), userId, Date.now() + maxAge * 1000);
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: maxAge * 1000,
      path: "/",
    });
  }
  private token(req: Request) {
    const raw = req.headers.cookie
      ?.split(";")
      .find((s) => s.trim().startsWith(`${cookieName}=`))
      ?.trim()
      .slice(cookieName.length + 1);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : undefined;
  }
  current(req: Request): Account | undefined {
    const token = this.token(req);
    if (!token) return;
    const row = this.db
      .prepare(
        "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at > ?",
      )
      .get(hashToken(token), Date.now()) as { user_id: string } | undefined;
    return row ? this.get(row.user_id) : undefined;
  }
  require = (req: Request, res: Response, next: NextFunction) => {
    const user = this.current(req);
    if (!user)
      return res
        .status(401)
        .json({
          error: {
            code: "AUTH_REQUIRED",
            message: "Sign in to open your personal diary.",
          },
        });
    res.locals.user = user;
    next();
  };
  logout(req: Request, res: Response) {
    const token = this.token(req);
    if (token)
      this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(hashToken(token));
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  saveProfile(id: string, profile: Profile) {
    this.db
      .prepare("UPDATE users SET profile=?,name=? WHERE id=?")
      .run(JSON.stringify(profile), profile.name, id);
    return this.get(id)!;
  }
}
