@tui
Feature: Advisor TUI overlay
  Scenario: Fresh startup keeps the Advisor overlay hidden
    Given a fresh Pi TUI session with an Advisor model
    Then the TUI screen should not contain "Advisor · persistent second agent"
    And the TUI screen should match the "tui-fresh-startup" plain text snapshot

  Scenario: Ask Advisor records a compact Advisor overlay transcript
    Given a fresh Pi TUI session with an Advisor model
    When the user submits "/advisor Review the primary transcript and send a Hint if useful." in the TUI
    Then the TUI screen should contain "Advisor ·"
    And the TUI screen should contain "Prompt"
    And the TUI screen should contain "Context"
    And the TUI screen should contain "Tool"
    And the TUI screen should contain "pull_transcript"
    And the TUI screen should contain "↳"
    And the TUI screen should contain "advise hint"
    And the TUI screen should contain "E2E_ADVISOR_DONE"
    And the Advisor overlay should match the "tui-ask-advisor-overlay" plain text snapshot

  Scenario: Advisor overlay can be hidden and shown again
    Given a fresh Pi TUI session with an Advisor model
    When the user submits "/advisor Review the primary transcript and send a Hint if useful." in the TUI
    Then the TUI screen should contain "Advisor ·"
    When the user submits "/advisor:hide" in the TUI
    Then the TUI screen should not contain "Advisor ·"
    When the user submits "/advisor:show" in the TUI
    Then the TUI screen should contain "Advisor ·"
