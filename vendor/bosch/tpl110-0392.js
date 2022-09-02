var debug_codes = {
  201: 'LoRa join request failed',
  208: 'Cause for last reset: Watchdog',
  209: 'Cause for last reset: Power-on',
  210: 'Cause for last reset: Unknown',
  215: 'Cause for last reset: Lockup',
  216: 'Cause for last reset: External PIN',
  217: 'Cause for last reset: Brown-out',
  404: 'Park detection algorithm recalibrating',
  717: 'Confirmed uplink message not acknowledged after 8 re-tries',
  720: 'LoRa join request failed',
  729: 'Confirmed uplink message not acknowledged after 8 re-tries',
  800: 'Invalid downlink message port',
  802: 'Invalid downlink message length',
  804: 'Invalid frame type request',
  805: 'Configuration selected was already active',
  808: 'Invalid DataRate value selected (port 52, ADR ON)',
  809: 'Invalid Parking status configuration selected (port 51, ADR ON)',
  810: 'Invalid Debug configuration selected (port 56, ADR ON)',
  880: 'Invalid value for DataRate (port 52)',
  881: 'Invalid length for DataRate (port 52)',
  882: 'Invalid value for Device Information Request (port 54)',
  883: 'Invalid length for Device Information Request (port 54)',
  884: 'Invalid value for Parking status confirmable configuration (port 51)',
  885: 'Invalid length for Parking status confirmable configuration (port 51)',
  886: 'WARNING: Heartbeat test mode enabled! (port 53)',
  887: 'Invalid value for Heartbeat frequency (port 53)',
  888: 'Invalid length for Heartbeat frequency (port 53)',
  889: 'Invalid value for Debug configuration (port 56)',
  890: 'Invalid length for Debug configuration (port 56)',
  891: 'Invalid value for Temperature measurements configuration (port 57)',
  892: 'Invalid length for Temperature measurements configuration (port 57)',
  893: 'Invalid value for Device Usage Request (port 55)',
  894: 'Invalid length for Device Usage Request (port 55)',
  895: 'Invalid value for ADR configuration request (port 58)',
  896: 'Invalid length for ADR configuration request (port 58)',
  897: 'Invalid value for ADR offset request (port 59)',
  898: 'Invalid length for ADR offset request (port 59)',
  899: 'Invalid user request',
  900: 'Invalid value for temperature threshold configuration request (port 60)',
  901: 'Invalid value for temperature threshold offset configuration request (port 60)',
  902: 'Invalid length for temperature threshold configuration request (port 60)',
  1001: 'User configuration parameters are recovered',
  1003: 'Communication parameters are recovered',
};
var ParkingStatusConfirmableConfiguration = [
  'Confirmed',
  'Unconfirmed with 1 uplink message',
  'Unconfirmed with 2 uplink messages',
  'Unconfirmed with 3 uplink messages',
  'Unconfirmed with 4 uplink messages',
];
var DataRateConfiguration = ['DR0', 'DR1', 'DR2', 'DR3', 'DR4', 'DR5'];
var HeartbeatFrequency = ['Short', 'Normal', 'Long', 'Test mode'];
var DeviceInformationRequest = ['Device URN', 'Firmware version'];
var DeviceUsageRequest = [
  'Number of parking status changes detected',
  'Time running in occupied state',
  'Number of uplink messages sent',
  'Number of times radar has been triggered',
  'Time running since restart',
  'Number of resets since installation',
  'Time running since installation',
];
var DebugConfiguration = ['Debug messages disabled ', '1 uplink message', '2 uplink message', '3 uplink message', '4 uplink message'];
var TemperatureMeasurementsConfiguration = ['Temperature measurements disabled', 'Periodic Temperature measurements enabled', 'Threshold based temperature alert enabled'];
var ADR = ['disabled', 'enabled'];
var ADRoffset = ['DR - 0', 'DR - 1', 'DR - 2', 'DR - 3', 'DR - 4', 'DR - 5'];

function decodeDebugCode(bytes) {
  return ((bytes[2] & 0xf) << 8) + bytes[3];
}

function decodeDebugMessage(bytes) {
  var debug_code = decodeDebugCode(bytes.slice(4, 8));
  return {
    sequence_number: (bytes[8] << 8) + bytes[9],
    debug_code: debug_code,
    debug_code_description: debug_codes[debug_code],
    timestamp: (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3],
  };
}

function decodeTemperature(byte) {
  return byte & 0x80 ? byte - 0x100 : byte;
}

function decodeUplink(input) {
  var data = {};
  switch (input.fPort) {
    case 1: // Parking status
      data.type = 'parking status';
      data.occupied = (input.bytes[0] & 0x1) === 0x1;
      break;

    case 2: // Heartbeat
      data.type = 'heartbeat';
      data.occupied = (input.bytes[0] & 0x1) === 0x1;
      if (input.bytes.length >= 2) {
        data.temperature = decodeTemperature(input.bytes[1]);
      }
      break;

    case 3: // Start-up
      var debug_obj = decodeDebugMessage(input.bytes.slice(0, 10));
      data.type = 'startup';
      data.occupied = (input.bytes[16] & 0x1) === 0x1;

      data.reset_cause = 0;
      switch (input.bytes[15]) {
        case 1:
          data.reset_reason = 'Watchdog';
          break;
        case 2:
          data.reset_reason = 'Power On';
          break;
        case 3:
          data.reset_reason = 'System Request';
          break;
        case 4:
          data.reset_reason = 'External Pin';
          break;
        case 5:
          data.reset_reason = 'Lockup';
          break;
        case 6:
          data.reset_reason = 'Brownout';
          break;
        case 7:
          data.reset_reason = 'Others';
          break;
        default:
          data.reset_reason = 'Unknown';
      }
      data.firmware_version = input.bytes[12] + '.' + input.bytes[13] + '.' + input.bytes[14];
      data.sequence_number = debug_obj.sequence_number;
      data.debug_code = debug_obj.debug_code;
      data.debug_code_description = debug_obj.debug_code_description;
      data.timestamp = debug_obj.timestamp;
      break;

    case 4: // Device information
      data.type = 'device information';
      data.bytes = input.bytes;

      switch (input.bytes.length) {
        // if there are three bytes to the packet then it's the firmware version
        case 3:
          data.type += ' - Firmware version';
          data.firmware_version = input.bytes[0] + '.' + input.bytes[1] + '.' + input.bytes[2];
          break;
        // if there are eleven bytes to the packet then it's the devices uniform resource name
        case 11:
          data.type += ' - Device URN';
          // Bytes 0 - 2 are the first six digits of the DevEUI whilst bytes 6 - 10 are the remaining 10 digits, convert to string
          data.devEUI =
            input.bytes[0].toString(16) +
            input.bytes[1].toString(16) +
            input.bytes[2].toString(16) +
            input.bytes[6].toString(16) +
            input.bytes[7].toString(16) +
            input.bytes[8].toString(16) +
            input.bytes[9].toString(16) +
            input.bytes[10].toString(16);
          data.productClass = {
            // Bits 7 - 4 of byte 3 when added to byte 4 form the least significant bits of the product code, convert to string
            productCode: (input.bytes[4] << 4) + (input.bytes[3] >> 4) == 0x001 ? 'PLS' : 'Unknown',
            // Bits 0 - 3 of byte 3 form the variant code, convert to string
            variantCode: input.bytes[3] & 0xf,
            // Byte 5 is the product class extension code which seemes to encode the LoRa frequency band, convert to string
            extension: input.bytes[5] === 0x00 ? 'EU868' : input.bytes[5] === 0x01 ? 'AS923' : 'Unknown',
          };
          break;
        default:
          break;
      }
      break;

    case 5: // Device usage
      data.type = 'device usage';
      switch (input.bytes[0]) {
        case 0:
          data.type = 'Number of parking status changes detected';
          data.parking_status_changes = (input.bytes[1] << 24) + (input.bytes[2] << 16) + (input.bytes[3] << 8) + input.bytes[4];
          break;
        case 1:
          data.type = 'Time running in occupied state';
          data.time_in_seconds = (input.bytes[1] << 24) + (input.bytes[2] << 16) + (input.bytes[3] << 8) + input.bytes[4];
          break;
        case 2:
          data.type = 'Number of uplink messages sent';
          data.uplink_messages_sent = {
            dr5_sf7: (input.bytes[16] << 16) + (input.bytes[17] << 8) + input.bytes[18],
            dr4_sf8: (input.bytes[13] << 16) + (input.bytes[14] << 8) + input.bytes[15],
            dr3_sf9: (input.bytes[10] << 16) + (input.bytes[11] << 8) + input.bytes[12],
            dr2_sf10: (input.bytes[7] << 16) + (input.bytes[8] << 8) + input.bytes[9],
            dr1_sf11: (input.bytes[4] << 16) + (input.bytes[5] << 8) + input.bytes[7],
            dr0_sf12: (input.bytes[1] << 16) + (input.bytes[2] << 8) + input.bytes[3],
          };
          break;
        case 3:
          data.type = 'Number of times the radar has been triggered';
          data.times_radar_triggered = (input.bytes[1] << 24) + (input.bytes[2] << 16) + (input.bytes[3] << 8) + input.bytes[4];
          break;
        case 4:
          data.type = 'Time running since restart';
          data.time_since_restart_seconds = (input.bytes[1] << 24) + (input.bytes[2] << 16) + (input.bytes[3] << 8) + input.bytes[4];
          break;
        case 5:
          data.type = 'Number of resets since installation';
          data.resets_since_install = {
            software_requested: (input.bytes[7] << 8) + input.bytes[6],
            watchdog: input.bytes[5],
            power_on: input.bytes[4],
            external_pin: input.bytes[3],
            lockup: input.bytes[2],
            brown_out: input.bytes[1],
          };
          break;
        case 6:
          data.type = 'Time running since installation';
          data.time_since_install = (input.bytes[1] << 24) + (input.bytes[2] << 16) + (input.bytes[3] << 8) + input.bytes[4];
          break;
        default:
          break;
      }
      break;

    case 6: // Debug
      var debug_obj2 = decodeDebugMessage(input.bytes);
      data.sequence_number = debug_obj2.sequence_number;
      data.debug_code = debug_obj2.debug_code;
      data.debug_code_description = debug_obj2.debug_code_description;
      data.timestamp = debug_obj2.timestamp;
      data.type = 'debug';
      break;

    case 7: // Temperature alert
      data.type = 'temperature alert';
      data.temperature = decodeTemperature(input.bytes[0]);
      break;
    default:
      return {
        errors: ['unknown FPort'],
      };
  }

  return {
    data: data,
  };
}

function encodeDownlink(input) {
  switch (input.data.command) {
    case 'Parking status confirmable configuration':
      var i = ParkingStatusConfirmableConfiguration.indexOf(input.data.device_usage_request);
      if (i === -1) {
        return {
          errors: ['invalid Parking status confirmable configuration'],
        };
      }
      return {
        fPort: 51,
        bytes: [i],
      };
    case 'DataRate configuration':
      var i = DataRateConfiguration.indexOf(input.data.device_usage_request);
      if (i === -1) {
        return {
          errors: ['invalid DataRate configuration'],
        };
      }
      return {
        fPort: 52,
        bytes: [i],
      };
    case 'Heartbeat frequency':
      var i = HeartbeatFrequency.indexOf(input.data.device_usage_request);
      if (i === -1) {
        return {
          errors: ['invalid Heartbeat frequency'],
        };
      }
      return {
        fPort: 53,
        bytes: [i],
      };
    case 'Device Information Request':
      var i = DeviceInformationRequest.indexOf(input.data.device_usage_request);
      if (i === -1) {
        return {
          errors: ['invalid Device Information Request'],
        };
      }
      return {
        fPort: 54,
        bytes: [i],
      };
    case 'Device Usage Request':
      var i = DeviceUsageRequest.indexOf(input.data.sub_command);
      if (i === -1) {
        return {
          errors: ['invalid Device Usage Request'],
        };
      }
      return {
        fPort: 55,
        bytes: [i],
      };
    case 'Debug configuration':
    case 'Temperature measurements configuration':
    case 'ADR':
    case 'ADR offse':
    case 'Temperature Thresholds for temperature alerts':
    default:
      return {
        errors: ['invalid command'],
      };
  }
}

function decodeDownlink(input) {
  switch (input.fPort) {
    case 55:
      return {
        // Decoded downlink (must be symmetric with encodeDownlink)
        data: {
          command: 'Device Usage Request',
          sub_command: DeviceUsageRequest[input.bytes[0]],
        },
      };
    default:
      return {
        errors: ['invalid FPort'],
      };
  }
}
