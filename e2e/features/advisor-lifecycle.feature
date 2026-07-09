Feature: Advisor Lifecycle Commands
  Scenario: Resetting Advisor transcript reports completion
    Given Advisor has a configured model
    When the user resets Advisor
    Then Advisor should confirm the transcript was reset

  Scenario: Watch Run cancellation without an active run reports a no-op
    Given Advisor has a configured model
    When the user turns Watch Run off
    Then Advisor should report that no Watch Run is active

  Scenario: Starting Watch Run again reports the active run
    Given Advisor is configured and Watch Run can wait for Primary Agent progress
    When the user starts Watch Run
    And the user starts Watch Run again
    Then Advisor should report that Watch Run is already running
