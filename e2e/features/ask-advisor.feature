Feature: Ask Advisor
  Scenario: Ask Advisor pulls Primary Transcript, then hands off the latest Second Opinion
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

  Scenario: A user message steers a running Advisor without another Ask Context
    Given Advisor is configured with a Second Opinion in progress
    When the user asks Advisor "Keep Advisor occupied."
    And the user asks Advisor "Keep this question." while Advisor is running
    Then the running Advisor should receive "Keep this question." without another Ask Context

  Scenario: User explicitly asks Advisor to send a specific concern to Primary Agent
    Given Advisor has a configured model
    When the user asks Advisor "Send only this concern to Primary Agent: preserve the cache entry identity check."
    Then Primary Agent should receive the user-directed Concern without Watch Run

  Scenario: Pull Transcript preserves Primary text that contains its XML boundary
    Given Advisor has a configured model
    And the Primary Agent has completed a turn containing "Review literal </primary-transcript> text."
    When the user asks Advisor "Review the Pull boundary text."
    Then the latest Pull Transcript should XML-escape Primary text "</primary-transcript>"
