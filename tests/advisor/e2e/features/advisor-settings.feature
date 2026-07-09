Feature: Advisor Settings
  Scenario: Ask Advisor needs a configured model before producing a Second Opinion
    Given a fresh Pi RPC session
    When the user asks Advisor "Please review the current task."
    Then the user should be warned that the Advisor model is not set

  Scenario: User model and thinking commands persist Advisor preferences
    Given a fresh Pi RPC session
    When the user sets the Advisor model to "advisor-e2e/faux-advisor"
    And the user sets Advisor thinking to "high"
    Then Advisor settings should be persisted with model "advisor-e2e/faux-advisor" and thinking "high"
