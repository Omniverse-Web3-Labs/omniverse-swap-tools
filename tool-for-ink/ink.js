const { BN, BN_ONE } = require("@polkadot/util");
const utils = require("./utils");
const MAX_CALL_WEIGHT = new BN(500_000_000_000).isub(BN_ONE);
const PROOFSIZE = new BN(1_000_000);

module.exports = {
    // sign and send transaction
    async sendTransaction(contract, methodName, sender, arguments) {
        try {
            let value = 0;
            const gasLimit = contract.api.registry.createType('WeightV2', {
                refTime: MAX_CALL_WEIGHT,
                proofSize: PROOFSIZE,
              });
            // const options = { storageDepositLimit: null, gasLimit }
            // const { gasRequired, storageDeposit, result } = await contract.query[methodName](
            //     sender.address,
            //     options,
            //     ...arguments
            //   );
            // console.log('gasRequired', gasRequired.toString());
            await contract.tx[methodName]({ storageDepositLimit: null, value, gasLimit }, ...arguments).signAndSend(sender, ({ status, events }) => {
                // console.log(status.isInBlock, status.isFinalized);
                if (status.isInBlock || status.isFinalized) {
                  events
                    // find/filter for failed events
                    .filter(({ event }) => contract.api.events.system.ExtrinsicFailed.is(event))
                    // we know that data for system.ExtrinsicFailed is
                    // (DispatchError, DispatchInfo)
                    .forEach(
                      ({
                        event: {
                          data: [error, info],
                        },
                      }) => {
                        if (error.isModule) {
                          // for module errors, we have the section indexed, lookup
                          const decoded = contract.api.registry.findMetaError(error.asModule);
                          const { docs, method, section } = decoded;
          
                          console.log(`${section}.${method}: ${docs.join(' ')}`);
                        } else {
                          // Other, CannotLookup, BadOrigin, no extra info
                          console.log(error.toString());
                        }
                      }
                    );
                }
              });
              await utils.sleep(10);
            return 'Ok';
        } catch (e) {
        console.error(e);
        }
    },

    // query info from blockchain node
    async contractCall(contract, method, from, arguments) {
        const storageDepositLimit = null;
        const gasLimit = contract.api.registry.createType('WeightV2', {
            refTime: MAX_CALL_WEIGHT,
            proofSize: PROOFSIZE,
          });
        const { gasRequired, result, output } = await contract.query[method](from, {gasLimit, storageDepositLimit}, ...arguments);
        if (result.isOk) {
            console.log('result ok');
            return output.asOk;
        }
        else {
            console.error('Error', result.asErr.toHuman());
        }
    }
  }