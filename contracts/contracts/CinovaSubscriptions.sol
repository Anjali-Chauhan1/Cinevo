// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICinovaRegistry, ICinovaVault} from "./interfaces/ICinova.sol";

/// @title CinovaSubscriptions
/// @notice Per-second creator subscriptions paid from the fan's vault balance.
///
/// No transaction runs every second: each subscription stores its monthly
/// price and when it was last charged, and the amount owed is worked out
/// whenever anyone touches it (the fan, the creator, or the Cinova server's
/// periodic sweep). Cancelling charges up to that second and stops. If the
/// balance runs out the subscription pauses until the fan subscribes again.
contract CinovaSubscriptions is ReentrancyGuard {
    /// A "month" for pricing purposes: price / PERIOD = rate per second.
    uint256 public constant PERIOD = 30 days;

    struct Subscription {
        uint128 monthlyPrice; // snapshot at subscribe time
        uint64 startedAt; // start of the current continuous run (for "3-month sub" badges)
        uint64 lastChargedAt;
        bool active;
    }

    ICinovaRegistry public immutable registry;
    ICinovaVault public immutable vault;

    /// creator => current monthly price (0 = subscriptions off)
    mapping(address => uint128) public monthlyPrice;
    /// fan => creator => subscription
    mapping(address => mapping(address => Subscription)) public subscriptions;

    event MonthlyPriceSet(address indexed creator, uint128 monthlyPrice);
    event Subscribed(address indexed fan, address indexed creator, uint128 monthlyPrice);
    event Charged(address indexed fan, address indexed creator, uint256 amount, uint256 toCreator, uint256 toPlatform);
    event Paused(address indexed fan, address indexed creator);
    event Cancelled(address indexed fan, address indexed creator);

    error NotCreator();
    error NotPublisher();
    error SubscriptionsOff();
    error AlreadySubscribed();
    error NotSubscribed();
    error InsufficientBalance();

    constructor(ICinovaRegistry registry_, ICinovaVault vault_) {
        registry = registry_;
        vault = vault_;
    }

    /// @notice Creator sets their price. Existing subscribers keep the price
    /// they signed up at until they resubscribe.
    function setMonthlyPrice(uint128 price) external {
        _setMonthlyPrice(msg.sender, price);
    }

    /// @notice The Cinova server applying the price a creator set in the app.
    function setMonthlyPriceFor(address creator, uint128 price) external {
        if (!registry.hasRole(registry.PUBLISHER_ROLE(), msg.sender)) revert NotPublisher();
        _setMonthlyPrice(creator, price);
    }

    function _setMonthlyPrice(address creator, uint128 price) private {
        if (!registry.isCreator(creator)) revert NotCreator();
        monthlyPrice[creator] = price;
        emit MonthlyPriceSet(creator, price);
    }

    function subscribe(address creator) external nonReentrant {
        if (!registry.isCreator(creator)) revert NotCreator();
        uint128 price = monthlyPrice[creator];
        if (price == 0) revert SubscriptionsOff();
        Subscription storage sub = subscriptions[msg.sender][creator];
        if (sub.active) revert AlreadySubscribed();
        // Require at least one day's worth up front so a subscription can't
        // start on an empty balance and pause immediately.
        if (vault.balanceOf(msg.sender) < price / 30) revert InsufficientBalance();

        subscriptions[msg.sender][creator] = Subscription({
            monthlyPrice: price,
            startedAt: uint64(block.timestamp),
            lastChargedAt: uint64(block.timestamp),
            active: true
        });
        emit Subscribed(msg.sender, creator, price);
    }

    /// @notice Charges up to now and stops. The fan pays only for time subscribed.
    function cancel(address creator) external nonReentrant {
        Subscription storage sub = subscriptions[msg.sender][creator];
        if (!sub.active) revert NotSubscribed();
        _charge(msg.sender, creator, sub);
        // _charge may already have paused it on an empty balance.
        if (sub.active) sub.active = false;
        emit Cancelled(msg.sender, creator);
    }

    /// @notice Charges what has accrued so far. Callable by anyone — the
    /// server runs it periodically and whenever a fan requests a withdrawal.
    function claimAccrued(address fan, address creator) external nonReentrant returns (uint256 charged) {
        Subscription storage sub = subscriptions[fan][creator];
        if (!sub.active) return 0;
        return _charge(fan, creator, sub);
    }

    /// @notice Amount accrued since the last charge.
    function owed(address fan, address creator) public view returns (uint256) {
        Subscription memory sub = subscriptions[fan][creator];
        if (!sub.active) return 0;
        return (uint256(sub.monthlyPrice) * (block.timestamp - sub.lastChargedAt)) / PERIOD;
    }

    /// @notice True while the subscription runs AND the balance still covers
    /// what has accrued — the check content gating (free episodes, chat
    /// badges, premiere access) should use.
    function isActive(address fan, address creator) external view returns (bool) {
        return subscriptions[fan][creator].active && vault.balanceOf(fan) >= owed(fan, creator);
    }

    function _charge(address fan, address creator, Subscription storage sub) private returns (uint256 charged) {
        uint256 due = owed(fan, creator);
        // Leave lastChargedAt alone when less than one base unit has accrued,
        // so sub-unit amounts keep accumulating instead of being rounded away.
        if (due == 0) return 0;

        uint256 balance = vault.balanceOf(fan);
        charged = due <= balance ? due : balance;
        sub.lastChargedAt = uint64(block.timestamp);
        if (charged < due) {
            sub.active = false;
            emit Paused(fan, creator);
        }
        if (charged == 0) return 0;

        (uint256 fee, uint256 net) = registry.splitFee(charged);
        if (fee > 0) vault.spend(fan, registry.treasury(), fee);
        vault.spend(fan, creator, net);
        emit Charged(fan, creator, charged, net, fee);
    }
}
