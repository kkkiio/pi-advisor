Feature: Advisor Settings
  Scenario: Ask Advisor needs a configured model before producing a Second Opinion
    Given Advisor has no configured model
    When the user asks Advisor "Please review the current task."
    Then the user should be warned that the Advisor model is not set

  Scenario: User model and thinking commands persist Advisor preferences
    Given Advisor has no configured model
    When the user selects a registered Advisor model
    And the user sets Advisor thinking to "high"
    Then Advisor preferences should persist the selected model and thinking "high"

  Scenario: User can inspect current Advisor preferences
    Given Advisor has no configured model
    When the user checks the Advisor model setting
    Then Advisor should report that no model is set
    When the user selects a registered Advisor model
    And the user checks the Advisor model setting
    Then Advisor should show the selected model
    When the user checks the Advisor thinking setting
    Then Advisor should show default thinking "medium"

  Scenario: Invalid Advisor preference commands report validation errors
    Given Advisor has no configured model
    When the user enters an invalid Advisor model format
    Then Advisor should warn with "Use /advisor:model <provider/model>."
    When the user selects an unavailable Advisor model
    Then Advisor should report that the selected model is unavailable
    When the user selects an unsupported Advisor thinking level
    Then Advisor should warn with "Use /advisor:thinking off|minimal|low|medium|high|xhigh."
