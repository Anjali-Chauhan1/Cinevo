/**
 * Demo data seed. Safe to re-run — every create is wrapped in an upsert or
 * an existence check, so re-seeding never duplicates rows.
 *
 * Demo accounts (password for all non-platform accounts: "password123"):
 *   admin@cinevo.app        - platform admin
 *   priya@cinevo.app        - creator, verified, India
 *   rahul@cinevo.app        - creator, verified, India (Producer Units demo, US-flagged backer seeded separately)
 *   viewer@cinevo.app       - plain viewer/fan, India, pre-funded wallet
 *   fan2@cinevo.app         - second fan, India, pre-funded wallet
 *   investor@cinevo.app     - US-region, KYC-verified, for the Producer Units flow
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PLATFORM_LEDGER_EMAIL,
  EpisodeStatus,
  PremiereStatus,
  CampaignStatus,
  KycStatus,
} from "../lib/constants";

const prisma = new PrismaClient();
const PASSWORD = "password123";

async function hashedPw() {
  return bcrypt.hash(PASSWORD, 10);
}

async function upsertUser(opts: {
  email: string;
  displayName: string;
  platformRole?: string;
  region?: string;
  kycStatus?: string;
  grantPaise?: number;
}) {
  const passwordHash = await hashedPw();
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    create: {
      email: opts.email,
      passwordHash,
      displayName: opts.displayName,
      platformRole: opts.platformRole ?? "VIEWER",
      region: opts.region ?? "IN",
      kycStatus: opts.kycStatus ?? "NONE",
    },
    update: {},
  });

  const account = await prisma.ledgerAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, balancePaise: 0 },
    update: {},
  });

  if (opts.grantPaise && account.balancePaise === 0) {
    await prisma.ledgerAccount.update({
      where: { id: account.id },
      data: { balancePaise: opts.grantPaise },
    });
    await prisma.ledgerTransaction.create({
      data: {
        accountId: account.id,
        type: "GRANT",
        amountPaise: opts.grantPaise,
        balanceAfter: opts.grantPaise,
        meta: JSON.stringify({ reason: "seed demo grant" }),
      },
    });
  }

  return user;
}

async function main() {
  console.log("Seeding Cinevo demo data...");

  // Platform operator account — the counterparty for every fee, holds
  // escrow-in-transit and the Producer Unit revenue pool.
  await upsertUser({ email: PLATFORM_LEDGER_EMAIL, displayName: "Cinevo Platform", platformRole: "ADMIN" });

  const admin = await upsertUser({ email: "admin@cinevo.app", displayName: "Cinevo Admin", platformRole: "ADMIN" });

  const priyaUser = await upsertUser({ email: "priya@cinevo.app", displayName: "Priya Sharma" });
  const rahulUser = await upsertUser({ email: "rahul@cinevo.app", displayName: "Rahul Verma" });
  await upsertUser({ email: "viewer@cinevo.app", displayName: "Asha Nair", grantPaise: 200000 }); // ₹2,000
  await upsertUser({ email: "fan2@cinevo.app", displayName: "Kabir Khan", grantPaise: 150000 }); // ₹1,500
  await upsertUser({
    email: "investor@cinevo.app",
    displayName: "Jordan Lee",
    region: "US",
    kycStatus: KycStatus.VERIFIED,
    grantPaise: 1000000, // ₹10,000
  });

  const priya = await prisma.creator.upsert({
    where: { userId: priyaUser.id },
    create: {
      userId: priyaUser.id,
      handle: "priya-films",
      channelName: "Priya Films",
      bio: "Student filmmaker from FTII. Short films about small-town India.",
      verificationStatus: "APPROVED",
      subPriceRupeesPaise: 4900,
    },
    update: {},
  });

  const rahul = await prisma.creator.upsert({
    where: { userId: rahulUser.id },
    create: {
      userId: rahulUser.id,
      handle: "rahul-reels",
      channelName: "Rahul Reels",
      bio: "First-time director. Currently raising for a feature-length debut.",
      verificationStatus: "APPROVED",
      subPriceRupeesPaise: 9900,
    },
    update: {},
  });

  const existingEmoteCount = await prisma.emote.count({ where: { creatorId: { in: [priya.id, rahul.id] } } });
  if (existingEmoteCount === 0) {
    await prisma.emote.createMany({
      data: [
        { creatorId: priya.id, code: ":priyaHeart:", glyph: "💛" },
        { creatorId: priya.id, code: ":priyaClap:", glyph: "👏" },
        { creatorId: rahul.id, code: ":rahulFire:", glyph: "🔥" },
      ],
    });
  }

  // --- Episodes -------------------------------------------------------
  const now = Date.now();

  let ep1 = await prisma.episode.findFirst({ where: { creatorId: priya.id, title: "Monsoon Letters — Ep 1" } });
  if (!ep1) {
    ep1 = await prisma.episode.create({
      data: {
        creatorId: priya.id,
        title: "Monsoon Letters — Ep 1",
        description: "A postman in a flood-prone village finds a decade-old undelivered letter.",
        videoKey: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        thumbnailUrl: "/demo-thumbs/monsoon-letters.svg",
        durationSeconds: 900,
        isPaid: false,
        status: EpisodeStatus.PUBLIC,
        publicAt: new Date(now - 10 * 86_400_000),
      },
    });
  }

  let ep2 = await prisma.episode.findFirst({ where: { creatorId: priya.id, title: "Monsoon Letters — Ep 2" } });
  if (!ep2) {
    ep2 = await prisma.episode.create({
      data: {
        creatorId: priya.id,
        title: "Monsoon Letters — Ep 2",
        description: "The postman tracks down the letter's intended reader, 12 years late.",
        videoKey: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        thumbnailUrl: "/demo-thumbs/monsoon-letters-2.svg",
        durationSeconds: 780,
        isPaid: true,
        rateRupeesPaise: 50,
        previewSeconds: 120,
        capRupeesPaise: 1500,
        status: EpisodeStatus.PUBLIC,
        publicAt: new Date(now - 3 * 86_400_000),
      },
    });
  }

  // A film currently in its PREMIERING window — this is what the premiere
  // room / hype bar / live chat screens demo against.
  let ep3 = await prisma.episode.findFirst({ where: { creatorId: rahul.id, title: "Signal Lost" } });
  if (!ep3) {
    ep3 = await prisma.episode.create({
      data: {
        creatorId: rahul.id,
        title: "Signal Lost",
        description: "A ham radio operator in the hills picks up a transmission that shouldn't exist.",
        videoKey: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        thumbnailUrl: "/demo-thumbs/signal-lost.svg",
        durationSeconds: 1080,
        isPaid: true,
        rateRupeesPaise: 100,
        previewSeconds: 120,
        capRupeesPaise: 2000,
        status: EpisodeStatus.PREMIERING,
        premiereAt: new Date(now - 5 * 60_000),
        earlyAccessUntil: new Date(now + 7 * 86_400_000),
        publicAt: new Date(now + 9 * 86_400_000),
      },
    });
    await prisma.premiere.upsert({
      where: { episodeId: ep3.id },
      create: { episodeId: ep3.id, startAt: ep3.premiereAt!, status: PremiereStatus.LIVE, viewerPeak: 3 },
      update: {},
    });
    await prisma.hypeProgress.upsert({
      where: { episodeId: ep3.id },
      create: { episodeId: ep3.id },
      update: {},
    });
    await prisma.hypeLevel.createMany({
      data: [
        {
          episodeId: ep3.id,
          level: 1,
          goalType: "TIPS",
          goalValue: 20000,
          unlockTitle: "Blooper reel after the credits",
        },
        {
          episodeId: ep3.id,
          level: 2,
          goalType: "TIPS",
          goalValue: 50000,
          unlockTitle: "Director's commentary clip",
        },
        {
          episodeId: ep3.id,
          level: 3,
          goalType: "REACTIONS",
          goalValue: 50,
          unlockTitle: "Live Q&A with the cast",
        },
      ],
    });
  }

  // A scheduled-but-not-yet-live episode (tests the DRAFT/SCHEDULED gating).
  const ep4Exists = await prisma.episode.findFirst({ where: { creatorId: priya.id, title: "Monsoon Letters — Ep 3" } });
  if (!ep4Exists) {
    await prisma.episode.create({
      data: {
        creatorId: priya.id,
        title: "Monsoon Letters — Ep 3",
        description: "Season finale. Premiering soon.",
        videoKey: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
        thumbnailUrl: "/demo-thumbs/monsoon-letters.svg",
        durationSeconds: 840,
        isPaid: true,
        rateRupeesPaise: 50,
        capRupeesPaise: 1200,
        status: EpisodeStatus.SCHEDULED,
        premiereAt: new Date(now + 3 * 86_400_000),
        earlyAccessUntil: new Date(now + 10 * 86_400_000),
        publicAt: new Date(now + 12 * 86_400_000),
      },
    });
  }

  // --- Campaign with Producer Units (Rahul's next feature) --------------
  const existingCampaign = await prisma.campaign.findFirst({ where: { creatorId: rahul.id } });
  if (!existingCampaign) {
    const campaign = await prisma.campaign.create({
      data: {
        creatorId: rahul.id,
        filmTitle: "The Last Frequency",
        pitch: "A feature-length follow-up to Signal Lost, backed by the fans who found it first.",
        goalPaise: 10_000_00, // ₹10,000 demo goal
        deadline: new Date(now + 20 * 86_400_000),
        deliveryDate: new Date(now + 90 * 86_400_000),
        status: CampaignStatus.ACTIVE,
        producerUnitsEnabled: true,
        tiers: {
          create: [
            { name: "Supporter", pricePaise: 9900, perks: JSON.stringify(["Name in credits", "Digital badge", "30 free watch minutes"]) },
            { name: "Insider", pricePaise: 49900, perks: JSON.stringify(["Above", "48h early access", "Behind the scenes"]) },
            { name: "Producer's Circle", pricePaise: 199900, perks: JSON.stringify(["Above", "Merch", "Vote on the ending"]) },
          ],
        },
        milestones: {
          create: [
            { order: 1, label: "Script lock", percentOfGoal: 30 },
            { order: 2, label: "Principal photography complete", percentOfGoal: 40 },
            { order: 3, label: "Final cut uploaded", percentOfGoal: 30 },
          ],
        },
      },
    });
    console.log(`Created campaign ${campaign.id}`);
  }

  console.log("Seed complete.");
  console.log(`Admin login: admin@cinevo.app / ${PASSWORD}`);
  console.log(`Creator logins: priya@cinevo.app, rahul@cinevo.app / ${PASSWORD}`);
  console.log(`Viewer logins: viewer@cinevo.app, fan2@cinevo.app, investor@cinevo.app (US/KYC) / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
