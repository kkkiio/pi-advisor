@interactive
Feature: Advisor Overlay
  Scenario: Fresh startup keeps the Advisor overlay hidden
    Given Advisor is configured in the interactive terminal
    Then Advisor Overlay should be hidden

  Scenario: Ask Advisor opens the Advisor Overlay
    Given Advisor is configured in the interactive terminal
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should be visible
    And the terminal cursor should be in Advisor Overlay input

  Scenario: Ask Advisor without a message focuses the Advisor Overlay input
    Given Advisor is configured in the interactive terminal
    When the user opens Advisor Overlay from the main input
    Then Advisor Overlay input should accept "Review this draft"
    And the terminal cursor should be in Advisor Overlay input
    When the user dismisses Advisor Overlay from its input
    Then Advisor Overlay should be hidden

  Scenario: Mouse wheel scrolls the open Advisor Overlay
    Given Advisor is configured in a compact interactive terminal
    When the user gives Primary Agent work to review
    Then Primary Agent should finish the work for Advisor
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should show a completed Second Opinion
    And mouse wheel interaction should be active for Advisor Overlay
    When the user scrolls Advisor Overlay upward with the mouse wheel
    Then Advisor Overlay should show content below the viewport
    When the user leaves Advisor Overlay
    Then Advisor Overlay should be hidden
    And normal terminal mouse interaction should be available
    And the main input should accept "Draft"

  Scenario: Leaving and returning to Advisor preserves its transcript
    Given Advisor is configured in the interactive terminal
    When the user gives Primary Agent work to review
    Then Primary Agent should finish the work for Advisor
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should show a completed Second Opinion
    When the user leaves Advisor Overlay
    Then Advisor Overlay should be hidden
    When the user returns to Advisor Overlay
    Then Advisor Overlay should be visible
    And Advisor Overlay should show a completed Second Opinion
    And the terminal cursor should be in Advisor Overlay input

  Scenario: Starting a new Advisor conversation opens its Overlay
    Given Advisor is configured in the interactive terminal
    When the user starts a new Advisor conversation from the main input
    Then Advisor Overlay should be visible
    And Advisor Overlay input should accept "Start fresh"
    And the terminal cursor should be in Advisor Overlay input

  Scenario: Pull reveals extra Primary chat items with the configured expand shortcut
    Given Advisor uses Ctrl+X to expand chats in the interactive terminal
    When the Primary conversation gains eight chat items
    And the user asks Advisor from the main input "Review all Primary chat items."
    Then Advisor Overlay should show a completed Second Opinion
    And Context should summarize one user and one agent message
    And Pull should summarize all eight Primary chat items
    And Pull should show the first five Primary chat items
    And Pull should offer to expand the remaining three items with Ctrl+X
    When the user presses Ctrl+X in Advisor Overlay
    Then Pull should show all eight Primary chat items
    When the user presses Ctrl+X in Advisor Overlay
    Then Pull should return to its five-item preview

  Scenario: Context and Pull preserve Primary chat text
    Given Advisor is configured in the interactive terminal
    When the user submits "E2E_PRIMARY_SENTINEL token=OVERLAY_SECRET_42" in the TUI
    Then Primary Agent should finish the work for Advisor
    When the user asks Advisor from the main input "Review the Primary chat items."
    Then Advisor Overlay should show a completed Second Opinion
    And Context and Pull should preserve the Primary text "token=OVERLAY_SECRET_42"
