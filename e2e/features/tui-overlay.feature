@interactive
Feature: Advisor Overlay
  Scenario: Fresh startup keeps the Advisor overlay hidden
    Given Advisor is configured in the interactive terminal
    Then Advisor Overlay should be hidden

  Scenario: Ask Advisor opens the Advisor Overlay
    Given Advisor is configured in the interactive terminal
    When the user asks Advisor from the main input "Review the primary transcript and send a Hint if useful."
    Then Advisor Overlay should be visible

  Scenario: Advisor overlay can be hidden and shown again
    Given Advisor is configured in the interactive terminal
    When the user asks Advisor from the main input "Review the primary transcript and send a Hint if useful."
    Then Advisor Overlay should be visible
    When the user hides Advisor Overlay
    Then Advisor Overlay should be hidden
    When the user shows Advisor Overlay
    Then Advisor Overlay should be visible
