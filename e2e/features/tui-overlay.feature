@interactive
Feature: Advisor Overlay
  Scenario: Fresh startup keeps the Advisor overlay hidden
    Given Advisor is configured in the interactive terminal
    Then Advisor Overlay should be hidden

  Scenario: Ask Advisor opens the Advisor Overlay
    Given Advisor is configured in the interactive terminal
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should be visible

  Scenario: Ask Advisor without a message focuses the Advisor Overlay input
    Given Advisor is configured in the interactive terminal
    When the user opens Advisor Overlay from the main input
    Then Advisor Overlay input should accept "Review this draft"
    And the terminal cursor should be in Advisor Overlay input
    When the user dismisses Advisor Overlay from its input
    Then Advisor Overlay should be hidden

  Scenario: Mouse wheel scrolls only a focused Advisor Overlay
    Given Advisor is configured in a compact interactive terminal
    When the user gives Primary Agent work to review
    Then Primary Agent should finish the work for Advisor
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should show a completed Second Opinion
    And normal terminal mouse interaction should be available
    When the user focuses Advisor Overlay input
    Then mouse wheel interaction should be active for Advisor Overlay
    When the user scrolls Advisor Overlay upward with the mouse wheel
    Then Advisor Overlay should show content below the viewport
    When the user returns focus to the main input
    Then normal terminal mouse interaction should be available
    And the main input should accept "Draft"
    When the user scrolls downward with the mouse wheel
    Then Advisor Overlay scroll position should stay unchanged

  Scenario: Advisor overlay can be hidden and shown again
    Given Advisor is configured in the interactive terminal
    When the user asks Advisor from the main input "Review the primary transcript."
    Then Advisor Overlay should be visible
    When the user hides Advisor Overlay
    Then Advisor Overlay should be hidden
    When the user shows Advisor Overlay
    Then Advisor Overlay should be visible
