import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;

// Stablecoin has 6 decimals: usd(1.5) = 1_500_000 base units.
const usd = (n: number) => BigInt(Math.round(n * 1_000_000));
const id = (s: string) => ethers.id(s); // keccak256 of an off-chain id
const ACK = id("I understand this supports the creator and may not be delivered");
const DAY = 24 * 60 * 60;
const WITHDRAW_DELAY = 10 * 60;

async function deployCinova() {
  // `server` is the Cinova backend: it holds PUBLISHER_ROLE and submits vouchers.
  const [admin, treasury, creator, viewer, fan2, investor, server, stranger] = await ethers.getSigners();

  const usdc = await ethers.deployContract("MockUSDC");
  const registry = await ethers.deployContract("CinovaRegistry", [
    admin.address,
    treasury.address,
    1000, // 10% platform fee
    usd(0.001), // min rate per minute (~₹0.10)
    usd(0.03), // max rate per minute (~₹2)
  ]);
  const vault = await ethers.deployContract("CinovaVault", [usdc, registry, WITHDRAW_DELAY]);
  const subscriptions = await ethers.deployContract("CinovaSubscriptions", [registry, vault]);
  const tips = await ethers.deployContract("CinovaTips", [registry, vault, usd(0.1)]);
  const backerPass = await ethers.deployContract("BackerPass", [admin.address, "https://cinova.app/pass/{id}.json"]);
  const implementation = await ethers.deployContract("FilmCampaign");
  const factory = await ethers.deployContract("CampaignFactory", [registry, usdc, backerPass, implementation]);

  const spenderRole = await registry.VAULT_SPENDER_ROLE();
  await registry.grantRole(spenderRole, subscriptions);
  await registry.grantRole(spenderRole, tips);
  await registry.grantRole(await registry.PUBLISHER_ROLE(), server.address);
  await backerPass.grantRole(await backerPass.FACTORY_ROLE(), factory);
  await registry.setCampaignFactory(factory);
  await registry.setVault(vault);
  await registry.registerCreator(creator.address);

  for (const who of [viewer, fan2, investor]) {
    await usdc.mint(who.address, usd(10_000));
    await usdc.connect(who).approve(vault, ethers.MaxUint256);
  }
  await vault.connect(viewer).deposit(usd(100));
  await vault.connect(fan2).deposit(usd(100));

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = { name: "Cinova Vault", version: "1", chainId, verifyingContract: await vault.getAddress() };
  const voucherTypes = {
    Voucher: [
      { name: "viewer", type: "address" },
      { name: "episodeId", type: "bytes32" },
      { name: "sessionId", type: "bytes32" },
      { name: "cumulativeAmount", type: "uint256" },
      { name: "expiry", type: "uint256" },
    ],
  };

  /** What the viewer's embedded wallet does silently every 10 seconds. */
  async function signVoucher(
    signer: typeof viewer,
    episodeId: string,
    sessionId: string,
    cumulativeAmount: bigint,
    expiry?: bigint
  ) {
    const voucher = {
      viewer: signer.address,
      episodeId,
      sessionId,
      cumulativeAmount,
      expiry: expiry ?? BigInt(await time.latest()) + BigInt(365 * DAY),
    };
    const signature = await signer.signTypedData(domain, voucherTypes, voucher);
    return { voucher, signature };
  }

  return {
    admin, treasury, creator, viewer, fan2, investor, server, stranger,
    usdc, registry, vault, subscriptions, tips, backerPass, factory, signVoucher,
  };
}

/** Same deployment plus one paid episode: ₹0.50/min-ish rate, $0.20 cap. */
async function withPaidEpisode() {
  const f = await deployCinova();
  const episodeId = id("episode-4");
  await f.registry.connect(f.creator).registerEpisode(episodeId, usd(0.006), 120, usd(0.2), true);
  return { ...f, episodeId };
}

function campaignConfig(now: bigint, overrides: Record<string, unknown> = {}) {
  return {
    goal: usd(20),
    deadline: now + BigInt(20 * DAY),
    deliveryDate: now + BigInt(90 * DAY),
    tierPrices: [usd(1), usd(6)],
    tierLimits: [0, 2],
    milestoneBps: [3000, 4000, 3000],
    unitsEnabled: true,
    unitPrice: usd(1),
    maxUnitSpendPerBacker: usd(60),
    unitHardCap: usd(150),
    ...overrides,
  };
}

async function campaignFixture() {
  const f = await deployCinova();
  const config = campaignConfig(BigInt(await time.latest()));
  const campaignAddress = await f.factory.connect(f.creator).createCampaign.staticCall(config);
  await f.factory.connect(f.creator).createCampaign(config);
  const campaign = await ethers.getContractAt("FilmCampaign", campaignAddress);
  for (const who of [f.viewer, f.fan2, f.investor]) await f.usdc.connect(who).approve(campaign, ethers.MaxUint256);
  return { ...f, campaign, config };
}

describe("CinovaRegistry", () => {
  it("only verifiers can register creators", async () => {
    const { registry, stranger } = await loadFixture(deployCinova);
    await expect(registry.connect(stranger).registerCreator(stranger.address)).to.be.revertedWithCustomError(
      registry,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("only registered creators can publish, within the allowed rate band", async () => {
    const { registry, creator, stranger } = await loadFixture(deployCinova);
    await expect(
      registry.connect(stranger).registerEpisode(id("x"), usd(0.006), 120, usd(0.2), true)
    ).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(
      registry.connect(creator).registerEpisode(id("x"), usd(0.5), 120, usd(0.2), true)
    ).to.be.revertedWithCustomError(registry, "InvalidPricing");
    await expect(registry.connect(creator).registerEpisode(id("free"), 0, 0, 0, false))
      .to.emit(registry, "EpisodeRegistered")
      .withArgs(id("free"), creator.address, 0, 0, 0, false);
  });

  it("only the episode's creator can change its pricing", async () => {
    const { registry, stranger, episodeId } = await loadFixture(withPaidEpisode);
    await expect(
      registry.connect(stranger).setPricing(episodeId, usd(0.01), 60, usd(1), true)
    ).to.be.revertedWithCustomError(registry, "NotEpisodeOwner");
  });

  it("caps the platform fee", async () => {
    const { registry } = await loadFixture(deployCinova);
    await expect(registry.setFeeBps(2001)).to.be.revertedWithCustomError(registry, "InvalidFee");
  });
});

describe("Publisher (the Cinova server acting for creators)", () => {
  it("registers and prices episodes for verified creators only", async () => {
    const { registry, server, creator, stranger } = await loadFixture(deployCinova);
    await expect(registry.connect(server).registerEpisodeFor(creator.address, id("ep"), usd(0.006), 120, usd(0.2), true))
      .to.emit(registry, "EpisodeRegistered")
      .withArgs(id("ep"), creator.address, usd(0.006), 120, usd(0.2), true);
    await registry.connect(server).setPricingFor(id("ep"), usd(0.01), 60, usd(1), true);
    expect((await registry.getEpisode(id("ep"))).ratePerMinute).to.equal(usd(0.01));

    await expect(
      registry.connect(server).registerEpisodeFor(stranger.address, id("ep2"), 0, 0, 0, false)
    ).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(
      registry.connect(stranger).registerEpisodeFor(creator.address, id("ep3"), 0, 0, 0, false)
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("launches campaigns and sets subscription prices for creators", async () => {
    const { factory, subscriptions, server, creator, stranger } = await loadFixture(deployCinova);
    const config = campaignConfig(BigInt(await time.latest()));
    const address = await factory.connect(server).createCampaignFor.staticCall(creator.address, config);
    await factory.connect(server).createCampaignFor(creator.address, config);
    expect(await (await ethers.getContractAt("FilmCampaign", address)).creator()).to.equal(creator.address);
    await expect(factory.connect(stranger).createCampaignFor(creator.address, config)).to.be.revertedWithCustomError(
      factory,
      "NotPublisher"
    );

    await subscriptions.connect(server).setMonthlyPriceFor(creator.address, usd(3));
    expect(await subscriptions.monthlyPrice(creator.address)).to.equal(usd(3));
    await expect(subscriptions.connect(stranger).setMonthlyPriceFor(creator.address, 1)).to.be.revertedWithCustomError(
      subscriptions,
      "NotPublisher"
    );
  });

  it("can never move anyone's money", async () => {
    const { vault, server, viewer } = await loadFixture(deployCinova);
    await expect(vault.connect(server).spend(viewer.address, server.address, 1)).to.be.revertedWithCustomError(
      vault,
      "NotSpender"
    );
  });
});

describe("CinovaVault — pay-per-minute", () => {
  it("settles a voucher with a 90/10 split into vault balances", async () => {
    const { vault, creator, treasury, viewer, server, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    const { voucher, signature } = await signVoucher(viewer, episodeId, id("s1"), usd(0.1));

    await expect(vault.connect(server).settle(voucher, signature))
      .to.emit(vault, "Settled")
      .withArgs(viewer.address, episodeId, id("s1"), usd(0.1), usd(0.09), 0, usd(0.01));
    expect(await vault.balanceOf(creator.address)).to.equal(usd(0.09));
    expect(await vault.balanceOf(treasury.address)).to.equal(usd(0.01));
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(100) - usd(0.1));
  });

  it("lets creators withdraw what they earned, after the delay", async () => {
    const { vault, usdc, creator, viewer, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    const { voucher, signature } = await signVoucher(viewer, episodeId, id("s1"), usd(0.2));
    await vault.settle(voucher, signature);

    await vault.connect(creator).requestWithdraw(usd(0.18));
    await time.increase(WITHDRAW_DELAY);
    await vault.connect(creator).withdraw();
    expect(await usdc.balanceOf(creator.address)).to.equal(usd(0.18));
  });

  it("pays only the increase, and rejects replayed or older vouchers", async () => {
    const { vault, viewer, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    const first = await signVoucher(viewer, episodeId, id("s1"), usd(0.05));
    const second = await signVoucher(viewer, episodeId, id("s1"), usd(0.08));

    await vault.settle(first.voucher, first.signature);
    await vault.settle(second.voucher, second.signature);
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(100) - usd(0.08));

    await expect(vault.settle(second.voucher, second.signature)).to.be.revertedWithCustomError(vault, "StaleVoucher");
    await expect(vault.settle(first.voucher, first.signature)).to.be.revertedWithCustomError(vault, "StaleVoucher");
  });

  it("stops charging at the episode cap, across sessions (free rewatch)", async () => {
    const { vault, viewer, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    const s1 = await signVoucher(viewer, episodeId, id("s1"), usd(0.35));
    await vault.settle(s1.voucher, s1.signature);
    expect(await vault.episodePaid(viewer.address, episodeId)).to.equal(usd(0.2));

    const s2 = await signVoucher(viewer, episodeId, id("s2"), usd(0.1));
    await expect(vault.settle(s2.voucher, s2.signature))
      .to.emit(vault, "Settled")
      .withArgs(viewer.address, episodeId, id("s2"), 0, 0, 0, 0);
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(100) - usd(0.2));
  });

  it("never takes more than the balance, and collects the shortfall after a top-up", async () => {
    const { vault, registry, creator, stranger, usdc, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    await registry.connect(creator).setPricing(episodeId, usd(0.006), 120, usd(5), true);
    await usdc.mint(stranger.address, usd(5));
    await usdc.connect(stranger).approve(vault, ethers.MaxUint256);
    await vault.connect(stranger).deposit(usd(0.3));

    const { voucher, signature } = await signVoucher(stranger, episodeId, id("s1"), usd(0.5));
    await vault.settle(voucher, signature);
    expect(await vault.balanceOf(stranger.address)).to.equal(0);
    expect(await vault.episodePaid(stranger.address, episodeId)).to.equal(usd(0.3));

    await vault.connect(stranger).deposit(usd(1));
    await vault.settle(voucher, signature);
    expect(await vault.balanceOf(stranger.address)).to.equal(usd(0.8));
    await expect(vault.settle(voucher, signature)).to.be.revertedWithCustomError(vault, "StaleVoucher");
  });

  it("rejects forged, expired and non-paid-episode vouchers", async () => {
    const { vault, registry, creator, viewer, fan2, episodeId, signVoucher } = await loadFixture(withPaidEpisode);

    const forged = await signVoucher(fan2, episodeId, id("s1"), usd(0.1));
    await expect(
      vault.settle({ ...forged.voucher, viewer: viewer.address }, forged.signature)
    ).to.be.revertedWithCustomError(vault, "InvalidSignature");

    const expired = await signVoucher(viewer, episodeId, id("s2"), usd(0.1), BigInt(await time.latest()) - 1n);
    await expect(vault.settle(expired.voucher, expired.signature)).to.be.revertedWithCustomError(vault, "VoucherExpired");

    await registry.connect(creator).registerEpisode(id("free-ep"), 0, 0, 0, false);
    const free = await signVoucher(viewer, id("free-ep"), id("s3"), usd(0.1));
    await expect(vault.settle(free.voucher, free.signature)).to.be.revertedWithCustomError(vault, "EpisodeNotPaid");
  });

  it("holds withdrawals for the delay, during which open sessions still settle", async () => {
    const { vault, usdc, viewer, episodeId, signVoucher } = await loadFixture(withPaidEpisode);
    const before = await usdc.balanceOf(viewer.address);
    const { voucher, signature } = await signVoucher(viewer, episodeId, id("s1"), usd(0.15));

    await vault.connect(viewer).requestWithdraw(usd(100));
    await expect(vault.connect(viewer).withdraw()).to.be.revertedWithCustomError(vault, "WithdrawNotReady");

    await vault.settle(voucher, signature);
    await time.increase(WITHDRAW_DELAY);
    await vault.connect(viewer).withdraw();

    expect(await vault.balanceOf(viewer.address)).to.equal(0);
    expect(await usdc.balanceOf(viewer.address)).to.equal(before + usd(100) - usd(0.15));
  });

  it("only registered spender contracts can move balances", async () => {
    const { vault, viewer, stranger } = await loadFixture(withPaidEpisode);
    await expect(vault.connect(stranger).spend(viewer.address, stranger.address, 1)).to.be.revertedWithCustomError(
      vault,
      "NotSpender"
    );
  });
});

describe("CinovaSubscriptions — per-second", () => {
  async function subscribed() {
    const f = await deployCinova();
    await f.subscriptions.connect(f.creator).setMonthlyPrice(usd(3)); // ~₹249/month
    await f.subscriptions.connect(f.viewer).subscribe(f.creator.address);
    return f;
  }

  it("accrues by the second and anyone can trigger the charge", async () => {
    const { subscriptions, vault, viewer, creator, treasury, server } = await loadFixture(subscribed);
    await time.increase(15 * DAY);
    expect(await subscriptions.owed(viewer.address, creator.address)).to.be.closeTo(usd(1.5), usd(0.0001));

    await subscriptions.connect(server).claimAccrued(viewer.address, creator.address);
    const charged = usd(100) - (await vault.balanceOf(viewer.address));
    expect(charged).to.be.closeTo(usd(1.5), usd(0.0001));
    expect(await vault.balanceOf(creator.address)).to.equal(charged - charged / 10n);
    expect(await vault.balanceOf(treasury.address)).to.equal(charged / 10n);
  });

  it("cancel charges up to that second and stops", async () => {
    const { subscriptions, vault, viewer, creator } = await loadFixture(subscribed);
    await time.increase(3 * DAY);
    await subscriptions.connect(viewer).cancel(creator.address);
    expect(usd(100) - (await vault.balanceOf(viewer.address))).to.be.closeTo(usd(0.3), usd(0.0001));

    await time.increase(30 * DAY);
    expect(await subscriptions.owed(viewer.address, creator.address)).to.equal(0);
    expect(await subscriptions.isActive(viewer.address, creator.address)).to.equal(false);
  });

  it("pauses when the balance runs out", async () => {
    const { subscriptions, vault, usdc, creator, stranger } = await loadFixture(subscribed);
    await usdc.mint(stranger.address, usd(1));
    await usdc.connect(stranger).approve(vault, ethers.MaxUint256);
    await vault.connect(stranger).deposit(usd(1));
    await subscriptions.connect(stranger).subscribe(creator.address);

    await time.increase(60 * DAY); // owes $6, has $1
    expect(await subscriptions.isActive(stranger.address, creator.address)).to.equal(false);
    await expect(subscriptions.claimAccrued(stranger.address, creator.address))
      .to.emit(subscriptions, "Paused")
      .withArgs(stranger.address, creator.address);
    expect(await vault.balanceOf(stranger.address)).to.equal(0);
  });

  it("refuses double subscriptions and empty balances", async () => {
    const { subscriptions, creator, viewer, stranger } = await loadFixture(subscribed);
    await expect(subscriptions.connect(viewer).subscribe(creator.address)).to.be.revertedWithCustomError(
      subscriptions,
      "AlreadySubscribed"
    );
    await expect(subscriptions.connect(stranger).subscribe(creator.address)).to.be.revertedWithCustomError(
      subscriptions,
      "InsufficientBalance"
    );
  });
});

describe("CinovaTips", () => {
  it("tips instantly with a 90/10 split", async () => {
    const { tips, vault, creator, treasury, viewer } = await loadFixture(deployCinova);
    await expect(tips.connect(viewer).tip(creator.address, id("episode-4"), usd(1), id("Loved it!")))
      .to.emit(tips, "Tipped")
      .withArgs(viewer.address, creator.address, id("episode-4"), usd(1), usd(0.9), usd(0.1), id("Loved it!"));
    expect(await vault.balanceOf(creator.address)).to.equal(usd(0.9));
    expect(await vault.balanceOf(treasury.address)).to.equal(usd(0.1));
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(99));
  });

  it("enforces the minimum, real creators, and no self-tipping", async () => {
    const { tips, creator, viewer, stranger } = await loadFixture(deployCinova);
    await expect(tips.connect(viewer).tip(creator.address, id("e"), usd(0.05), ethers.ZeroHash)).to.be.revertedWithCustomError(tips, "TipTooSmall");
    await expect(tips.connect(viewer).tip(stranger.address, id("e"), usd(1), ethers.ZeroHash)).to.be.revertedWithCustomError(tips, "NotCreator");
    await expect(tips.connect(creator).tip(creator.address, id("e"), usd(1), ethers.ZeroHash)).to.be.revertedWithCustomError(tips, "SelfTip");
  });
});

describe("FilmCampaign — backing, milestones, refunds", () => {
  it("escrows backing and issues a soulbound pass", async () => {
    const { campaign, backerPass, usdc, viewer, fan2 } = await loadFixture(campaignFixture);
    await expect(campaign.connect(viewer).back(1, ACK)).to.emit(campaign, "Backed").withArgs(viewer.address, 1, usd(6), ACK);
    expect(await usdc.balanceOf(campaign)).to.equal(usd(6));

    const passId = await backerPass.tokenIdFor(campaign, 1);
    expect(await backerPass.balanceOf(viewer.address, passId)).to.equal(1);
    await expect(
      backerPass.connect(viewer).safeTransferFrom(viewer.address, fan2.address, passId, 1, "0x")
    ).to.be.revertedWithCustomError(backerPass, "Soulbound");
  });

  it("backs straight from the vault balance, no wallet tokens needed", async () => {
    const { campaign, vault, backerPass, usdc, viewer, stranger } = await loadFixture(campaignFixture);
    await expect(vault.connect(viewer).backCampaign(campaign, 1, ACK))
      .to.emit(campaign, "Backed")
      .withArgs(viewer.address, 1, usd(6), ACK);
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(94));
    expect(await usdc.balanceOf(campaign)).to.equal(usd(6));
    expect(await campaign.contributionOf(viewer.address)).to.equal(usd(6));
    expect(await backerPass.balanceOf(viewer.address, await backerPass.tokenIdFor(campaign, 1))).to.equal(1);
    // The vault keeps no leftover allowance to the campaign.
    expect(await usdc.allowance(vault, campaign)).to.equal(0);

    await expect(vault.connect(stranger).backCampaign(campaign, 0, ACK)).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    await expect(vault.connect(viewer).backCampaign(stranger.address, 0, ACK)).to.be.revertedWithCustomError(vault, "UnknownCampaign");
  });

  it("only the vault can back on someone's behalf or route revenue", async () => {
    const { campaign, viewer, stranger } = await loadFixture(campaignFixture);
    await expect(campaign.connect(stranger).backFor(viewer.address, 0, ACK)).to.be.revertedWithCustomError(campaign, "NotVault");
    await expect(campaign.connect(stranger).distributeRevenue(usd(1))).to.be.revertedWithCustomError(campaign, "NotVault");
  });

  it("requires the risk acknowledgement and respects tier limits", async () => {
    const { campaign, viewer, fan2 } = await loadFixture(campaignFixture);
    await expect(campaign.connect(viewer).back(0, ethers.ZeroHash)).to.be.revertedWithCustomError(campaign, "MissingAcknowledgement");
    await campaign.connect(viewer).back(1, ACK);
    await campaign.connect(fan2).back(1, ACK);
    await expect(campaign.connect(viewer).back(1, ACK)).to.be.revertedWithCustomError(campaign, "TierSoldOut");
  });

  it("releases milestones only with proof and approval, into the creator's balance", async () => {
    const { campaign, vault, admin, creator, server, stranger, viewer, investor, registry, treasury, config } =
      await loadFixture(campaignFixture);
    await registry.setInvestorVerified(investor.address, true);
    await campaign.connect(viewer).back(1, ACK); // $6
    await campaign.connect(investor).buyUnits(14, ACK); // $14 -> goal $20 met
    await time.increaseTo(config.deadline);

    await expect(campaign.connect(admin).releaseMilestone(0)).to.be.revertedWithCustomError(campaign, "NoProof");
    await expect(campaign.connect(stranger).submitMilestoneProof(0, id("x"))).to.be.revertedWithCustomError(campaign, "NotCreator");
    // The server can submit proof the creator uploaded in the app.
    await campaign.connect(server).submitMilestoneProof(0, id("script.pdf"));
    await expect(campaign.connect(creator).releaseMilestone(0)).to.be.revertedWithCustomError(campaign, "NotApprover");

    await expect(campaign.connect(admin).releaseMilestone(0))
      .to.emit(campaign, "MilestoneReleased")
      .withArgs(0, usd(6), usd(5.4), usd(0.6)); // 30% of $20
    expect(await campaign.state()).to.equal(1); // Funded

    for (const i of [1, 2]) {
      await campaign.connect(creator).submitMilestoneProof(i, id(`proof-${i}`));
      await campaign.connect(admin).releaseMilestone(i);
    }
    expect(await campaign.state()).to.equal(2); // Delivered
    expect(await vault.balanceOf(creator.address)).to.equal(usd(18));
    expect(await vault.balanceOf(treasury.address)).to.equal(usd(2));
  });

  it("refunds into the backer's balance when the goal is missed, and revokes passes", async () => {
    const { campaign, vault, backerPass, viewer, config } = await loadFixture(campaignFixture);
    await vault.connect(viewer).backCampaign(campaign, 1, ACK);
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(94));
    await time.increaseTo(config.deadline);

    await expect(campaign.connect(viewer).claimRefund()).to.emit(campaign, "Refunded").withArgs(viewer.address, usd(6));
    expect(await vault.balanceOf(viewer.address)).to.equal(usd(100));
    expect(await backerPass.balanceOf(viewer.address, await backerPass.tokenIdFor(campaign, 1))).to.equal(0);
    await expect(campaign.connect(viewer).claimRefund()).to.be.revertedWithCustomError(campaign, "NothingToClaim");
  });

  it("refunds what is left in escrow if the film misses its delivery date", async () => {
    const { campaign, admin, creator, viewer, fan2, config } = await loadFixture(campaignFixture);
    for (let i = 0; i < 2; i++) await campaign.connect(viewer).back(0, ACK); // $2
    await campaign.connect(viewer).back(1, ACK); // $6 -> viewer $8
    await campaign.connect(fan2).back(1, ACK); // $6
    for (let i = 0; i < 6; i++) await campaign.connect(fan2).back(0, ACK); // fan2 $12 -> total $20
    await time.increaseTo(config.deadline);
    await campaign.connect(creator).submitMilestoneProof(0, id("script"));
    await campaign.connect(admin).releaseMilestone(0); // $6 of $20 released

    await time.increaseTo(config.deliveryDate + 1n);
    expect(await campaign.refundAmount(viewer.address)).to.equal(0); // not failed until synced
    await campaign.syncState();
    expect(await campaign.state()).to.equal(3); // Failed
    expect(await campaign.refundAmount(viewer.address)).to.equal(usd(5.6));
    expect(await campaign.refundAmount(fan2.address)).to.equal(usd(8.4));
  });

  it("gates Producer Units behind KYC and the per-person cap, from wallet or balance", async () => {
    const { campaign, vault, registry, investor, viewer } = await loadFixture(campaignFixture);
    await expect(campaign.connect(investor).buyUnits(10, ACK)).to.be.revertedWithCustomError(campaign, "NotVerifiedInvestor");
    await expect(vault.connect(viewer).buyUnits(campaign, 1, ACK)).to.be.revertedWithCustomError(campaign, "NotVerifiedInvestor");
    await registry.setInvestorVerified(investor.address, true);
    await expect(campaign.connect(investor).buyUnits(61, ACK)).to.be.revertedWithCustomError(campaign, "OverPersonalCap");
    await campaign.connect(investor).buyUnits(50, ACK);

    await vault.connect(investor).deposit(usd(20));
    await vault.connect(investor).buyUnits(campaign, 10, ACK);
    expect(await campaign.unitsOf(investor.address)).to.equal(60);
    await expect(vault.connect(investor).buyUnits(campaign, 1, ACK)).to.be.revertedWithCustomError(campaign, "OverPersonalCap");
  });

  it("only lets an episode share revenue with its own creator's campaign", async () => {
    const { registry, server, creator, stranger, campaign } = await loadFixture(campaignFixture);
    await registry.connect(creator).registerEpisode(id("film"), usd(0.006), 120, usd(500), true);
    await expect(registry.connect(creator).setRevenueRecipient(id("film"), stranger.address)).to.be.revertedWithCustomError(
      registry,
      "InvalidRecipient"
    );
    await registry.connect(server).setRevenueRecipientFor(id("film"), campaign);
    expect((await registry.getEpisode(id("film"))).revenueRecipient).to.equal(await campaign.getAddress());
  });
});

describe("Revenue waterfall (Producer Units)", () => {
  async function fundedFilm() {
    const f = await deployCinova();
    const config = campaignConfig(BigInt(await time.latest()), {
      goal: usd(100),
      deliveryDate: BigInt(await time.latest()) + BigInt(365 * DAY),
      tierPrices: [usd(1)],
      tierLimits: [0],
      milestoneBps: [10000],
      maxUnitSpendPerBacker: usd(100),
      unitHardCap: 0,
    });
    const address = await f.factory.connect(f.creator).createCampaign.staticCall(config);
    await f.factory.connect(f.creator).createCampaign(config);
    const campaign = await ethers.getContractAt("FilmCampaign", address);

    await f.registry.setInvestorVerified(f.investor.address, true);
    await f.usdc.connect(f.investor).approve(campaign, ethers.MaxUint256);
    await campaign.connect(f.investor).buyUnits(100, ACK); // $100 raised in units
    await time.increaseTo(config.deadline);
    await campaign.syncState(); // Funded

    const episodeId = id("the-film");
    await f.registry.connect(f.creator).registerEpisode(episodeId, usd(0.006), 120, usd(1000), true);
    await f.registry.connect(f.creator).setRevenueRecipient(episodeId, campaign);
    await f.vault.connect(f.viewer).deposit(usd(500));
    return { ...f, campaign, episodeId };
  }

  it("pays unit holders 50% of gross until they recoup 120%, then 20%", async () => {
    const { vault, campaign, usdc, creator, viewer, investor, treasury, episodeId, signVoucher } = await loadFixture(fundedFilm);

    // $100 gross: $10 fee, $50 units, $40 creator.
    const first = await signVoucher(viewer, episodeId, id("s1"), usd(100));
    await expect(vault.settle(first.voucher, first.signature))
      .to.emit(vault, "Settled")
      .withArgs(viewer.address, episodeId, id("s1"), usd(100), usd(40), usd(50), usd(10));
    // $100 escrow from the units sale + only the units' $50 share of this payment.
    expect(await usdc.balanceOf(campaign)).to.equal(usd(150));
    expect(await usdc.allowance(vault, campaign)).to.equal(0);

    // Next $200 gross crosses the $120 recoup line after $140 more gross:
    // $140 at 50% = $70, then $60 at 20% = $12 -> units $82, creator $98.
    const second = await signVoucher(viewer, episodeId, id("s1"), usd(300));
    await expect(vault.settle(second.voucher, second.signature))
      .to.emit(vault, "Settled")
      .withArgs(viewer.address, episodeId, id("s1"), usd(200), usd(98), usd(82), usd(20));
    expect(await campaign.unitsRecouped()).to.equal(usd(132));

    // After recoup, a plain 20/70/10 split.
    const third = await signVoucher(viewer, episodeId, id("s2"), usd(100));
    await expect(vault.settle(third.voucher, third.signature))
      .to.emit(vault, "Settled")
      .withArgs(viewer.address, episodeId, id("s2"), usd(100), usd(70), usd(20), usd(10));

    expect(await campaign.claimableRevenue(investor.address)).to.equal(usd(152));
    await campaign.connect(investor).claimRevenue();
    expect(await vault.balanceOf(investor.address)).to.equal(usd(152));
    expect(await vault.balanceOf(creator.address)).to.equal(usd(208));
    expect(await vault.balanceOf(treasury.address)).to.equal(usd(40));
  });

  it("splits revenue between holders in proportion to their units", async () => {
    const f = await deployCinova();
    const config = campaignConfig(BigInt(await time.latest()), {
      goal: usd(40),
      deliveryDate: BigInt(await time.latest()) + BigInt(365 * DAY),
      tierPrices: [usd(1)],
      tierLimits: [0],
      milestoneBps: [10000],
      maxUnitSpendPerBacker: usd(100),
      unitHardCap: 0,
    });
    const address = await f.factory.connect(f.creator).createCampaign.staticCall(config);
    await f.factory.connect(f.creator).createCampaign(config);
    const campaign = await ethers.getContractAt("FilmCampaign", address);
    for (const who of [f.investor, f.fan2]) {
      await f.registry.setInvestorVerified(who.address, true);
      await f.usdc.connect(who).approve(campaign, ethers.MaxUint256);
    }
    await campaign.connect(f.investor).buyUnits(30, ACK);
    await campaign.connect(f.fan2).buyUnits(10, ACK);
    await time.increaseTo(config.deadline);

    await f.registry.connect(f.creator).registerEpisode(id("film"), usd(0.006), 120, usd(1000), true);
    await f.registry.connect(f.creator).setRevenueRecipient(id("film"), campaign);
    const { voucher, signature } = await f.signVoucher(f.viewer, id("film"), id("s1"), usd(20));
    await f.vault.settle(voucher, signature); // $20 gross -> $18 net -> units $10

    expect(await campaign.claimableRevenue(f.investor.address)).to.equal(usd(7.5));
    expect(await campaign.claimableRevenue(f.fan2.address)).to.equal(usd(2.5));
  });
});
