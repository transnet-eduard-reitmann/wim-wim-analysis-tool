<!-- Source: BBD5249_Ver31AlarmLimitsWeighBridgesWheelImpactSkewBogie.pdf -->

<!-- Page 1 -->

Wynand Janse
van Rensburg

Digitally signed by Wynand Janse van Rensburg
DN: c=ZA, o=LAWtrust, o=Transnet RA, ou=Freight
Rail, 2.5.4.20=8210155002089,
serialNumber=Technology Management, cn=Wynand
Janse van Rensburg,
email=wynand.jansevanrensburg@transnet.net
Date: 2011.02.09 15:19:32 +02'00'

SIGN

SIGN

<!-- Page 2 -->

BBD5249 Version 3

Page 2 of 11

CONTENTS

1 SCOPE ............................................................................................................................................................................3

1.1 IDENTIFICATION ........................................................................................................................................................3
1.2 OVERVIEW ................................................................................................................................................................3
1.3 DOCUMENT OVERVIEW .............................................................................................................................................3
1.4 APPLICABLE DOCUMENTS..........................................................................................................................................3

2 TYPES OF ALARMS SPECIFIED..............................................................................................................................4

2.1 TYPE 1 ALARM (CONTINUE TO MAINTENANCE DEPOT)..............................................................................................4
2.2 TYPE 2 ALARM (CONTINUE TO STATION)...................................................................................................................4
2.3 TYPE 3 ALARM (STOP TRAIN IMMEDIATELY) ............................................................................................................5

3 ALARM LIMITS ...........................................................................................................................................................5

3.1 SKEW LOADING (END-TO-END)..................................................................................................................................5
3.2 SKEW LOADING (SIDE-TO-SIDE).................................................................................................................................5
3.3 OVERLOADING ..........................................................................................................................................................6
3.4 UNDER-LOADING.......................................................................................................................................................6
3.5 WHEEL IMPACTS .......................................................................................................................................................6
3.6 LATERAL FORCES......................................................................................................................................................7

4 APPENDIX A ...............................................................................................................................................................10

5 APPENDIX B ...............................................................................................................................................................11

<!-- Page 3 -->

BBD5249 Version 3

Page 3 of 11

1  SCOPE

1.1 Identification
This document specifies the alarm limits for the different types of alarms available in the
Integrated Train Condition Monitoring System (ITCMS) for measurements obtained from
Weighbridges, Wheel Impact Monitors and Skew Bogie Detectors.  This document also
provides information regarding the severity of the detected defect and requirements for the
operating actions.

1.2 Overview
Transnet is installing various train condition monitoring systems on its railway lines which
are used to improve the safety of operations.  This is done by generating alarms from
either the condition monitoring system itself or by the ITCMS.  The ITCMS has the ability to
generate alarms by using the measurements of these systems and making certain
calculations to determine the condition value.  Some of the alarms are routed to an
Operator Alarm Terminal (OAT) situated on the relevant Train Control Officer’s (TCO) desk
and some of the alarms are routed to a Maintenance Alarm Terminal (MAT) which is used
for the scheduling of maintenance on the rolling stock.
In order to generate meaningful and valid alarms, the alarms limits need to be configured.
Since there are different documents which specifies different alarms limits, this document
will serve as the standard in Transnet and will specify the different alarm limits to be
configured for these systems.

1.3 Document Overview

This document will serve as the standard for the specified alarm limits and will replace all
other documents and specifications which specify an alarm limit with regards to the
measurements of weighbridges, wheel impact monitors and skew bogie detectors
installed on the railway network in Transnet.
All the different types of alarms will be defined and specified. These alarms are applicable
on weighbridges, wheel impact monitors and skew bogie detectors.  Appendix B contains
a matrix with all the different alarms and their alarm limits.

1.4 Applicable documents
This document is based on the following documents:

<!-- Page 4 -->

BBD5249 Version 3

Page 4 of 11

1.4.1 BBB8790 (Version 2XA) – “ITCMS Measurements and alarms”

1.4.2 BBC7837 – “Vehicle/Track interaction – Force limits”

1.4.3 BBD7709 – “Limits for unbalanced loading of freight wagons”

1.4.4 BBD7313 – “Skidded wheels – skid length and wheel impact limits”

1.4.5 Ore line directives

These documents were used for literature purposes and for guidance to decide on the
alarm limits.  In addition to the information of these documents, a workgroup was
constituted to verify and update the alarm limits specified in this document.  The
workgroup represented the following departments in Transnet Freight Rail:
 Technology Management -Track Technology
 Technology Management –Train Design
 Technology Management – Mechanical Technology
 Technology Management – Wheel-Rail Interaction
 Technology Management –Condition Assessment Technologies
 Infrastructure Engineering
This document will henceforth replace all other documents regarding the alarm limit
values for weighbridges, wheel impact monitors and skew bogie detectors.
2 TYPES OF ALARMS SPECIFIED
The alarms-limits will be specified under different types of alarms.  The following types of
alarms are distinguished:

2.1 Type 1 Alarm (Continue to maintenance depot)
This alarm will be generated for non-critical operational conditions.  Under these
conditions it is understood that the situation is not safety-critical at the time (i.e. there is no
danger of catastrophic incidents such as a derailment).  These alarms require no
operational actions and are presented to the maintenance department for action.

2.2 Type 2 alarm (Continue to station)
This alarm will be generated for serious conditions and requires operating intervention.
These conditions are not safety-critical at the time, but have the potential to develop into a
catastrophic condition if not attended to.  Therefore, the train can continue to the next
station for corrective actions before the train may depart.

<!-- Page 5 -->

BBD5249 Version 3

Page 5 of 11

2.3 Type 3 alarm (Stop Train Immediately)
This alarm is for safety-critical conditions and requires operating intervention.  This means
that the train shall be stopped immediately for corrective actions before the train can
depart.
3 ALARM LIMITS

3.1 Skew loading (end-to-end)
3.1.1 Skew loading (end-to-end) is defined as uneven loading in the longitudinal direction,
i.e. the difference between the mass of the front and back bogie of a wagon.

3.1.2 The ratio of end-to-end differences is calculated as follows:

% end-to-end difference = |LB1 – LB2|/(LB1+LB2) x 100
where
LB1 = Total load on front bogie
LB2 = Total load on back bogie
3.1.3 When the end-to-end difference is more than 12% a Type 2 alarm shall be
generated. The 12% safety limit value includes the accuracy tolerance of the measuring
system [BBD7709]. Commercial limits should be lower than 12%.

3.1.4 A deviation from the end-to-end skew loading limit as defined in 3.1.3 above is
permitted for container wagons provided that the train compilation rules as defined in
Report BBD7709 and Clause 1021.4 of the General Appendix No.6 (Part 1) are applied.

3.2 Skew loading (side-to-side)
3.2.1 Skew loading (side-to-side) is defined as uneven loading in the lateral direction, i.e.
the difference between the mass of the left and right side of the wagon.

3.2.2 The ratio of side-to-side differences is calculated as follows:

% side-to-side difference = |LS1 – LS2|/(LS1+LS2) x 100
where
LS1 = Total load on left hand side wheels
LS2 = Total load on right hand side wheels
3.2.3 When the side-to-side difference is more than 12% a Type 2 alarm shall be
generated. The 12% safety limit value includes the accuracy tolerance of the measuring

<!-- Page 6 -->

BBD5249 Version 3

Page 6 of 11

system [BBD7709]. Commercial limits should be lower than 12%.

3.3 Overloading
3.3.1 Overloading is divided into two categories: Wagon overloading and train overloading.

 Wagon overloading is defined as the positive difference between the wagon’s
measured gross mass and the wagon’s maximum allowable gross mass.
 Train overloading is defined as the positive difference between the measured gross
mass of all the wagons of the train consist and the sum of all the wagons’ maximum
allowable gross mass, measured in tons.
3.3.2 When a wagon is overloaded by more than 7% of the maximum allowable gross
wagon mass, a Type 2 alarm shall be generated. The 7% safety limit value includes the
accuracy tolerance of the measuring system [BBD7709]. Commercial limits should be
lower than 7%.

3.3.3 When the train is overloaded by more than n tons, where n is the number of wagons
in the consist, a Type 2 alarm shall be generated.

3.4 Under-loading
3.4.1 Under-loading is relevant when an under-loaded wagon is in front of fully loaded
wagon(s) in a train consist.

3.4.2 Under-loading is the positive difference between the maximum allowable gross
wagon mass and the measured gross wagon mass, measured in tons.

3.4.3 When a wagon is under-loaded by more than 30% of its capacity, a Type 2 alarm
shall be generated.

3.5 Wheel Impacts
Due to the fact that WIM-WIMs are installed on different class lines with different rail types
which are able to withstand different wheel impact forces, the maximum wheel impact
shall also be specified according to the class of line and the type of rail on which the WIM-
WIM is installed.

<!-- Page 7 -->

BBD5249 Version 3


| Class of line | Rail section | Rail steel with lowest strength | Max. permissible axle load | Type 1 alarm | Type 2 alarm        | Type 3 alarm        |
| ------------- | ------------ | ------------------------------- | -------------------------- | ------------ | ------------------- | ------------------- |
| S             | 60 kg/m      | Spoornet S116 CrMn              | 30 ton                     | -            | 240 kN (or 24 tons) | 270 kN (or 27 tons) |
| N1            | 57 kg/m      | UIC Grade 900A                  | 22 ton                     | -            | 160 kN (or 16 tons) | 190 kN (or 19 tons) |

Page 7 of 11

With reference to the above and Report BBD7313, maximum wheel impacts as measured
by a WIM-WIM system shall not exceed the limit values as provided in the table below:

3.6 Lateral Forces
The different types of lateral force measurements are explained by means of the drawing
in Figure 1.


# F1


# F3



# F2


# F4



# Travel



# Left



# Right


Figure 1:  Lateral force convention (forces applied on the rail by the wheel)
According to Figure 1, the following is defined:

<!-- Page 8 -->

BBD5249 Version 3

Page 8 of 11

Wheel 1 lateral force = F1
Wheel 2 lateral force = F2
Wheel 3 lateral force = F3
Wheel 4 lateral force = F4
Axle 1 (wheel 1 & 2) gauge spreading force = F1 - F2
Axle 2 (wheel 3 & 4) gauge spreading force = F3 – F4
Bogie couple = (F1 + F2) – (F3 + F4)
For 3 axle bogies, bogie couple is calculated using the lateral forces from axle 1 and 3
(the outermost axles on the bogie).
3.6.1 When a wheel lateral force greater than 3 tons and less than 4 tons is detected, a
Type 1 alarm shall be generated.

3.6.2 When a wheel lateral force greater than 4 tons and less than 6 tons is detected, a
Type 2 alarm shall be generated.

3.6.3 When a wheel lateral force greater or equal than 6 tons or a Lateral / Vertical wheel
force greater than 1 is detected, a Type 3 alarm shall be generated.

3.6.4 When a gauge spreading force greater 4 tons and less than 5 tons is detected, a
Type 1 alarm shall be generated.

3.6.5 When a gauge spreading force of greater or equal than 5 tons is detected, a Type 2
alarm shall be generated.

3.6.6 When a bogie couple limit greater than 4 tons and less than 5 tons is detected, a
Type 2 alarm shall be generated.

3.6.7 When a bogie couple limit greater or equal than 5 tons is detected, a Type 2 alarm
shall be generated.

<!-- Page 9 -->

BBD5249 Version 3

Page 9 of 11

<!-- Page 10 -->

BBD5249 Version 3


| TERM                               | DEFINITION                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| ITCMS                              | Integrated Condition Monitoring System                                         |
| MAT                                | Maintenance Alarm Terminal                                                     |
| OAT                                | Operator Alarm Terminal                                                        |
| TCO                                | Train Control Officer                                                          |
| Station                            | The closest place with a siding which will facilitate the uncoupling of wagons |
| Measured Gross Wagon Mass          | The gross wagon mass as measured by the weighing instrument                    |
| Maximum Allowable Gross Wagon Mass | The maximum carrying capacity of a wagon + the wagon’s tare mass               |
| Gross wagon mass                   | The tare mass of wagon + the mass of its load                                  |
| Tare mass                          | The mass of the wagon when empty                                               |

Page 10 of 11

<!-- Page 11 -->

BBD5249 Version 1XA


| Safety Alarms limits for rolling stock |                                        |                                                                                |                                                                                |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| ALARM TYPE                             | ALARMS                                 |                                                                                |                                                                                |
|                                        | TYPE 1 (Continue to maintenance depot) | TYPE 2 (Continue to station)                                                   | TYPE 3 (Stop train)                                                            |
| SKEW LOADING (END- END)                |                                        | ≥ 12%                                                                          |                                                                                |
| SKEW LOADING (SIDE- SIDE)              |                                        | ≥ 12%                                                                          |                                                                                |
| OVERLOADING                            |                                        | ≥ 7% per wagon 1 ton x number of wagons on train                               |                                                                                |
| UNDERLOADING                           |                                        | More than 30% under load, then at next depot remove wagon to back of train     |                                                                                |
| WHEEL IMPACTS                          |                                        | 240 kN (or 24 tons) on a S 60 kg/m line 160 kN (or 19 tons) on N1 57 kg/m line | 270 kN (or 27 tons) on a S 60 kg/m line 190 kN (or 19 tons) on N1 57 kg/m line |
| LATERAL FORCES                         | > 3 ton and < 4 and ton                | > 4 and < 6 ton                                                                | ≥ 6 tons or L/V > 1.0 Remove from train                                        |
| GAUGE SPREADING FORCES                 | > 4 ton and < 5 ton                    | ≥ 5 ton                                                                        |                                                                                |
| BOGIE COUPLE LIMITS                    | > 4 ton and < 5 ton                    | ≥ 5 ton                                                                        |                                                                                |

GAUGE SPREADING
FORCES

Table 2:  Alarm Matrix
