import AWS from 'aws-sdk'
import axios from 'axios'
import { get } from 'lodash'
import moment from 'moment'
import xmldoc from 'xmldoc'

import config from './config.json'

const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'})

exports.handler = function(event, context) {
  dynamodb.getItem({
      'TableName': 'earthquake',
      'Key': {
        'id': {
          'S': '1'
        }
      },
      'AttributesToGet': ['last_updated_at']
    }, (err, data) => {
      if (err) {
        context.fail(err)
      } else {
        const lastUpdatedAt = get(data, ['Item', 'last_updated_at', 'S'])
        axios.get('http://opendata.cwb.gov.tw/govdownload?dataid=E-A0015-001R&authorizationkey=rdec-key-123-45678-011121314')
          .then(data => {
            const result = get(data, 'data')
            if (result) {
              const document = new xmldoc.XmlDocument(result)
              const sent = document.descendantWithPath('sent').val

              if (moment(sent).isAfter(lastUpdatedAt)) {
                dynamodb.updateItem({
                  'TableName': 'earthquake',
                  'Key': {
                    'id': {
                      'S': '1'
                    }
                  },
                  'AttributeUpdates': {
                    'last_updated_at': {
                      'Action': 'PUT',
                      'Value': {
                        'S': sent
                      }
                    }
                  }
                }, (err, data) => {
                  if (err) {
                    context.fail(err)
                  } else {
                    const reportContent = document.descendantWithPath('dataset.earthquake.reportContent').val
                    const web = document.descendantWithPath('dataset.earthquake.web').val
                    const shakemapImageURI = document.descendantWithPath('dataset.earthquake.shakemapImageURI').val
                    axios.post(config.Slack.WEBHOOK_URL, {
                      'attachments': [{
                        'fallback': '有地震！請注意安全。',
                        'text': `<${web}|${reportContent}>`,
                        'color': 'danger',
                        'image_url': shakemapImageURI
                      }]
                    }).then(() => context.succeed(reportContent))
                      .catch(err => context.fail(err))
                  }
                })
              } else {
                context.succeed()
              }
            } else {
              context.fail()
            }
          })
          .catch(err => context.fail(data))
      }
    })
}
