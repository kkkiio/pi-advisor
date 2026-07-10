Feature: Ask Advisor
  Scenario: Ask Advisor without a message reports usage
    Given Advisor has a configured model
    When the user asks Advisor without a message
    Then Advisor should warn with "Usage: /advisor <message>"

  Scenario: Ask Advisor pulls Primary Transcript View, then hands off the latest Second Opinion
    Given Advisor has a configured model
    And the Primary Agent has recent work for Advisor to review
    When the user asks Advisor "Review the primary transcript."
    And the user hands off the latest Advisor Second Opinion with "Please verify and apply this if it is real."
    Then Primary Agent should receive the latest Advisor Second Opinion handoff

  Scenario: Advisor inherits Primary inspection tools without file editing tools
    Given Advisor has a configured model
    When the user asks Advisor "Inspect the available evidence."
    Then Advisor should receive the Primary Agent inspection tools
    And Advisor should not receive file editing tools

  Scenario: A busy Advisor rejects a new Ask and preserves the question
    Given Advisor is configured with a Second Opinion in progress
    When the user asks Advisor "Keep Advisor occupied."
    And the user asks Advisor "Keep this question." while Advisor is busy
    Then Advisor should reject the busy Ask and restore "/advisor Keep this question."
