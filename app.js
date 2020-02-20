'use strict'

const PRISM = require('nutanix_prism')
const UUID = require('uuid/v1')

const IMAGEURL = 'http://10.XX.XXX.XX/images/CentOS/centos7-w-ngt-disk.qcow2'
const CLUSTER_IP = '10.XX.XX.XX'
const CLUSTER_USERNAME = 'USERNAME'
const CLUTER_PASSWORD = 'ntnxLab!'
const IMAGENAME = 'Test VM Disk'
const CONTAINERNAME = 'images'
const VMNAME = 'Testing VM-0'
const THISUUID = UUID()

let thisTask = {
    uuid: THISUUID,
    type: 'imagesAndVMs',
    prismIP: CLUSTER_IP,
    prismPass: CLUTER_PASSWORD,
    url: IMAGEURL,
    imageName: IMAGENAME,
    containerName: CONTAINERNAME,
    vmName: VMNAME,
    percent: 0,
    status: 'pending',
    networkUUID: '',
    quantity: 1
}
let thisSubTask1 = {
    uuid: THISUUID,
    ord: 0,
    prismTask: '',
    type: 'uploadImage',
    weight: 80,
    percent: 0,
    status: 'pending'
}

let thisSubTask2 = {
    uuid: THISUUID,
    ord: 1,
    prismTask: '',
    type: 'createVMNew',
    weight: 10,
    percent: 0,
    status: 'pending'
}
let thisSubTask3 = {
    uuid: THISUUID,
    ord: 2,
    prismTask: '',
    type: 'powerOnVMNew',
    weight: 10,
    percent: 0,
    status: 'pending'                                           
}
let opts = {
    ip: CLUSTER_IP,
    creds: {
        username: CLUSTER_USERNAME,
        password: CLUTER_PASSWORD
    }
}

// JUST GETS THE FIRST NETWORK FROM THE LIST OF AVAILABLE NETWORKS / COULD BE FURTHER REFINED.
PRISM.networks.get(opts)
.then(networkResult => {
    thisTask.networkUUID = networkResult.entities[0]['uuid']
    console.log(thisTask.networkUUID)
})
.catch(err => console.log(err))

// Run this task every 30 seconds.
setInterval(() => {
    start(thisTask, thisSubTask1,thisSubTask2,thisSubTask3)
}, 30 * 1000)

/**
 * Start the image upload and monitoring.
 */
function start (thisTask, thisSubTask1,thisSubTask2,thisSubTask3) {
    if (thisTask.status == 'pending') {
        let opts = {
            ip: thisTask.prismIP,
            creds: {
                username: thisTask.username,
                password: thisTask.prismPass
            },
            containerName: thisTask.containerName,
            imageUrl: thisTask.url,
            imageName: thisTask.imageName
        }
        PRISM.image.createDisk(opts)
        .then(resp => {
            thisSubTask1.prismTask = resp['task_uuid']
            thisSubTask1.status = 'progress'
            thisTask.status = 'progress'
            console.log('Successfully Initiated upload of image.')
        })
        .catch(err => {
            console.log('Error while attempting to upload the image from URL: ' + err)
            thisTask.status = 'FAILED'
            thisSubTask1.status = 'FAILED'
        })
    }
    else {
        stage (thisTask, thisSubTask1, thisSubTask2, thisSubTask3)
    }
}
/**
 * Check which stage each of the subtasks are in
 * @param {*} thisTask 
 * @param {*} thisSubTask1 
 * @param {*} thisSubTask2 
 * @param {*} thisSubTask3 
 */
function stage (thisTask, thisSubTask1, thisSubTask2, thisSubTask3) {
    if (thisTask.type == 'imagesAndVMs' && thisTask.status == 'progress') {
        if (thisSubTask1.status == 'pending') {
            console.log('We Shouldnt be in a pending state')
        }
        else if (thisSubTask1.status == 'progress') {
            checkPrismTask(thisTask, thisSubTask1)
        }
        else if (thisSubTask1.status == 'complete' && thisSubTask2.status == 'pending') {
            createVM(thisTask,thisSubTask1,thisSubTask2)
        }
        else if (thisSubTask2.status == 'progress') {
            checkPrismTask(thisTask, thisSubTask2)
        }
        else if (thisSubTask2.status == 'complete' && thisSubTask3.status == 'pending') {
            powerOnVM(thisTask,thisSubTask2,thisSubTask3)
        }
        else if (thisSubTask3 == 'progress') {
            checkPrismTask (thisTask,thisSubTask3)
        }
        else {
            console.log('Got into an unknown state or all work is completed :)')
        }
    }
    else {
        console.log("All Work is Done.")
    }
}

/**
 * Checks the prism API for the status of the task and subTask after ip selection
 * @param {Object} thisTask The Primary task object.
 * @param {Object} thisSubTask The SubTask object.
 * @param {String} Prism IP
 * @param {String} Prism Username
 * @param {string} Prism password
 */
function checkPrismTask(thisTask, thisActiveSubTask) {
    let opts = {
        ip: thisTask.prismIP,
        creds: {
            username: 'admin',
            password: thisTask.prismPass
        },
        taskUUID: thisActiveSubTask.prismTask 
    }
    // CHECK THE STATUS CALLING PRISM API
    PRISM.task.get(opts)
    .then(prismResult => {
        // IF COMPLETED SUCCESSFULLY
        if (prismResult['percentage_complete'] == 100 && prismResult['progress_status'] == 'Succeeded') {
            console.log('Subtask Succeeded.  ' + thisTask.uuid + ' subTaskType: ' + thisActiveSubTask.type)
            thisActiveSubTask.status = 'complete'
            thisActiveSubTask.percent = 100
            updateTask(thisTask,thisActiveSubTask)
            if(thisActiveSubTask.type == 'powerOnVMNew') {
                thisTask.status == 'complete'
                console.log('Successfully created the vm')
            }
        }
        // IF FAILED
        else if (prismResult['progress_status'] == 'Failed' || prismResult['progress_status'] == 'Aborted') {
            console.log('Task Failed.  ' + thisTask.uuid + ' subTaskType ' + thisActiveSubTask.type)
            thisActiveSubTask.status = 'failed'
            thisTask.status = 'failed'
            handleFailure(thisTask, thisActiveSubTask)
        }
        // ELSE ASSUME IN PROGRESS
        else {
            console.log('Subtask still in progress.  ' + thisTask.uuid + ' subTaskType ' + thisActiveSubTask.type)
            thisActiveSubTask.percent = prismResult['percentage_complete']
            updateTask(thisTask,thisActiveSubTask)
        }
    })
    .catch(err => {
        console.log('Error calling prism API for task ' + thisTask.uuid + ' subTaskType ' + thisActiveSubTask.type + ' prismTaskUUID: ' + opts.taskUUID + ' Err: ' + err)
    })
}

function createVM(thisTask,previousSubTask, activeSubTask) {
    let opts = {
        ip: thisTask.prismIP,
        creds: {
            username: 'admin',
            password: thisTask.prismPass
        }
    }
    // GET THE VM ID FROM THE PREVIOUSLY FINISHED SUBTASK AND QUERY FOR ENTITY_ID
    opts.taskUUID = previousSubTask.prismTask
    // CALLING PRISM API
    PRISM.task.get(opts)
    .then(taskResult => {
        opts.imageID = taskResult['entity_list'][0]['entity_id']
        PRISM.image.get(opts)
        .then(imageResult => {
            opts.body = {
                description: 'My Test-VM',
                memory_mb: 4000,
                name: thisTask.vmName,
                num_cores_per_vcpu: 2,
                num_vcpus: 1,
                boot: {boot_device_type: 'DISK',disk_address: {vmdisk_uuid: imageResult.vm_disk_id,device_bus: 'SCSI',device_index: 0}},
                vm_disks: [{vm_disk_clone: { disk_address: { vmdisk_uuid: imageResult.vm_disk_id}}}],
                vm_nics: [{network_uuid: thisTask.networkUUID,request_ip: true}]
            }
            PRISM.vm.create(opts)
            .then(createResult => {
                activeSubTask.status = 'progress'
                activeSubTask.prismTask = createResult['task_uuid']
                console.log('Successfully sent vm create api.')
            })
            .catch(err => {
                console.log('Error while creating vm: ' + err)
                handleFailure(thisTask,activeSubTask)
            })
        })
        .catch(err => {
            console.log('Error while attempting to get image details: ' + err)
            handleFailure(thisTask,activeSubTask)
        })
    })
    .catch(err => {
        console.log('Error calling prism API for task createVM.  Err: ' + err)
        handleFailure(thisTask,activeSubTask)
    })
}

/**
 * Power on the virtual machine
 * @param {Object} thisTask The parent task.
 * @param {Object} previousSubTask The previously active subTask.
 * @param {Object} activeSubTask The active subTask.
 */
function powerOnVM (thisTask, previousSubTask, activeSubTask) {
    let opts = {
        ip: thisTask.prismIP,
        creds: {
            username: 'admin',
            password: thisTask.prismPass
        }
    }
    // GET THE VM ID FROM THE PREVIOUSLY FINISHED SUBTASK AND QUERY FOR ENTITY_ID
    opts.taskUUID = previousSubTask.prismTask
    // CALLING PRISM API
    PRISM.task.get(opts)
    .then(taskResult => {
        opts.vmUUID = taskResult['entity_list'][0]['entity_id']
        startVMPowerOn(activeSubTask,opts)
    })
    .catch(err => {
        console.log('Error calling prism API for task powerOnVM.  Err: ' + err)
        handleFailure(thisTask,activeSubTask)
    })
}

/**
 * Perform the actual power on of the vm's and log the prism task.
 * @param {Array} vmIds UUID's from prism for the VM to power on.
 * @param {Object} activeSubTask The active subTask object.
 * @param {Object} opts Prism API Options.
 */
function startVMPowerOn (activeSubTask,opts) {
    // POWER ON THE VM IF IT WAS SUCCESSFULLY CREATED
    PRISM.vm.start(opts)
    .then(startResult => {
        console.log('Power on vm task created for task ' + activeSubTask.uuid)
        activeSubTask.prismTask = startResult['task_uuid']
        activeSubTask.status = 'progress'
    })
    .catch(err => {
        console.log('There was an error powering on the vm for task ' + activeSubTask.uuid + ' err: ' + err)
        handleFailure(thisTask,activeSubTask)
    })
}

function updateTask(thisTask,thisSubTask) {
    thisTask.percent += thisSubTask.percent * thisSubTask.weight
}

function handleFailure(thisTask, activeSubTask) {
    console.log("Failed to upload image " + thisTask.url +  " on " + activeSubTask.type)
    thisTask.status = 'FAILED'
    activeSubTask.status = 'FAILED'
}

function handleSuccess(thisTask, activeSubTask) {
    console.log("Succeeded uploading image " + thisTask.url + " on " + activeSubTask.type)
    thisTask.status = 'complete'
    thisActiveSubTask.status = 'complete'
}
